import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription as RxSubscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService } from '../../core/services/websocket.service';

import { FormsModule } from '@angular/forms';

export interface MoratoriumStep { percentage: number; daysAfter: number; }
export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  reservations_count: number;
  /** Durée de validité du pass en jours (BLOC 1). */
  duration_days?: number;
  allows_moratorium: boolean;
  moratorium_config?: MoratoriumStep[];
  owner?: { id: string; shop_name?: string; user?: { first_name: string; last_name: string } };
}

/** Souscription renvoyée par `GET /subscriptions/my-subscriptions`. */
export interface ClientSubscription {
  id: string;
  plan_id: string;
  status: 'pending' | 'active' | 'suspended' | 'expired' | 'completed' | 'cancelled';
  reservations_used: number;
  start_date: string;
  end_date: string;
  created_at: string;
  plan?: SubscriptionPlan;
  installments?: { id: string; status: string; amount: number; due_date: string }[];
}

/**
 * BLOC 2 — Cadence et durée du fallback de polling.
 *
 * L'événement `payment:confirmed` voyage par WebSocket ; si la connexion est
 * tombée, le tunnel restait affiché **sans jamais finir**. On repasse par
 * l'API (source de vérité) toutes les 3 s, sur 30 s au total.
 */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 30000;

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './subscriptions.component.html',
  styleUrls: ['./subscriptions.component.scss']
})
export class SubscriptionsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private wsService = inject(WebSocketService);

  plans = signal<SubscriptionPlan[]>([]);
  isLoading = signal(true);
  subscribingId = signal<string | null>(null);
  /** Plans couverts par un abonnement réellement **actif**. */
  subscribedIds = signal<string[]>([]);
  /** Plans dont la souscription attend encore la confirmation de paiement. */
  pendingIds = signal<string[]>([]);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  infoMessage = signal<string | null>(null);
  paymentGatewayUrls = signal<any>(null);
  awaitingInstallmentId = signal<string | null>(null);

  selectedPlanForPayment = signal<SubscriptionPlan | null>(null);
  operator = signal<'WAVE' | 'OM'>('WAVE');
  phone = signal('');

  private destroyed = false;
  private ownsSocket = false;
  private wsConfirmSub: RxSubscription | null = null;
  private wsFailSub: RxSubscription | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollDeadline = 0;
  private apiSubs: RxSubscription[] = [];
  private timerHandles: ReturnType<typeof setInterval>[] = [];

  ngOnInit(): void {
    this.loadPlans();
    this.loadMySubscriptions();

    // Retour de passerelle : returnUrl = /my-subscriptions?status=success.
    // La page vient d'être rechargée, on a perdu l'id d'échéance : on suit
    // donc l'apparition d'un abonnement qui n'était pas encore actif.
    if (this.route.snapshot.queryParamMap.get('status') === 'success') {
      this.startGatewayReturnWatch();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPolling();
    this.wsConfirmSub?.unsubscribe();
    this.wsFailSub?.unsubscribe();
    // BLOC 2 — Fuite mémoire : on lâche le socket et les listeners qu'on a
    // ouverts, sinon `payment:confirmed` survit à la destruction du composant.
    if (this.ownsSocket) this.wsService.disconnect();
    this.timerHandles.forEach(t => clearInterval(t));
    this.apiSubs.forEach(s => s.unsubscribe());
  }

  // ── Chargement ────────────────────────────────────────────────────────

  private loadPlans(): void {
    this.track(this.api.get<any>('/subscriptions/plans/all').subscribe({
      next: (res) => {
        this.plans.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Impossible de charger les formules.');
        this.isLoading.set(false);
      }
    }));
  }

  /** BLOC 2 — Hydrate `subscribedIds` : elle était vide à chaque affichage. */
  private loadMySubscriptions(): void {
    if (!this.auth.isAuthenticated()) return;
    this.track(this.api.get<any>('/subscriptions/my-subscriptions').subscribe({
      next: (res) => this.applySubscriptions(res.data || []),
      // 401 / 404 : la page reste consultable, simplement sans badge.
      error: () => {},
    }));
  }

  private applySubscriptions(subs: ClientSubscription[]): void {
    this.subscribedIds.set(this.activePlanIds(subs));
    this.pendingIds.set(
      subs.filter(s => s.status === 'pending').map(s => s.plan_id),
    );
  }

  private activePlanIds(subs: ClientSubscription[]): string[] {
    return [...new Set(
      subs.filter(s => s.status === 'active').map(s => s.plan_id),
    )];
  }

  private track(sub: RxSubscription): void {
    this.apiSubs.push(sub);
  }

  // ── Souscription ──────────────────────────────────────────────────────

  openPaymentModal(plan: SubscriptionPlan): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.selectedPlanForPayment.set(plan);
    this.errorMessage.set(null);
  }

  closePaymentModal(): void {
    this.selectedPlanForPayment.set(null);
  }

  confirmPayment(): void {
    const plan = this.selectedPlanForPayment();
    if (!plan || this.subscribingId()) return;

    const phoneVal = this.phone().trim();

    this.subscribingId.set(plan.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.infoMessage.set(null);

    this.track(this.api.post<any>('/subscriptions/subscribe', {
      plan_id: plan.id,
      paymentPhone: phoneVal,
      operator: this.operator(),
    }).subscribe({
      next: (res) => {
        this.closePaymentModal();
        const data = res.data;
        const subscription = data?.subscription;
        const redirectUrl = data?.redirect_url;
        const firstInstallment = subscription?.installments?.[0];

        if (redirectUrl && firstInstallment) {
           this.paymentGatewayUrls.set({ redirect_url: redirectUrl, urls: data.urls });
           this.awaitingInstallmentId.set(firstInstallment.id);
           this.infoMessage.set(
             'Paiement envoyé. Confirmez la transaction sur votre application Mobile Money.',
           );

           this.watchPayment(plan, firstInstallment.id);
           this.startPolling(plan);

           this.ownsSocket = true;
           this.wsService.connect();
           this.wsService.joinBooking(firstInstallment.id);

           if (!/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
              window.open(redirectUrl, '_blank');
           } else {
              window.location.href = redirectUrl;
           }
        } else {
           this.subscribingId.set(null);
           this.subscribedIds.update(ids => [...ids, plan.id]);
           this.successMessage.set(`✅ Vous avez souscrit à la formule "${plan.name}" !`);
           setTimeout(() => { if (!this.destroyed) this.successMessage.set(null); }, 5000);
        }
      },
      error: (err) => {
        this.subscribingId.set(null);
        this.errorMessage.set(err.error?.message || 'Erreur lors de la souscription.');
      }
    }));
  }

  /**
   * Écoute WebSocket — et reprise du parcours si le socket était tombé :
   * `WebSocketService.onPaymentConfirmed()` ne retournait aucun `teardown`,
   * les handlers restaient accrochés au socket après destruction du composant.
   */
  private watchPayment(plan: SubscriptionPlan, installmentId: string): void {
    this.wsConfirmSub = this.wsService.onPaymentConfirmed().subscribe(() => {
      this.finalizeSuccess(plan);
    });
    this.wsFailSub = this.wsService.onPaymentFailed().subscribe(() => {
      this.finalizeFailure('Le paiement a été refusé ou a échoué.');
    });
  }

  /**
   * BLOC 2 — Filet de sécurité : si `payment:confirmed` n'arrive pas, on
   * interroge l'état réel de l'échéance via l'API toutes les 3 s (30 s max).
   */
  private startPolling(plan: SubscriptionPlan): void {
    this.stopPolling();
    this.pollDeadline = Date.now() + POLL_MAX_MS;

    this.pollTimer = setInterval(() => {
      if (this.destroyed) { this.stopPolling(); return; }

      const installmentId = this.awaitingInstallmentId();
      if (!installmentId) { this.stopPolling(); return; }

      if (Date.now() > this.pollDeadline) {
        this.stopPolling();
        this.subscribingId.set(null);
        this.awaitingInstallmentId.set(null);
        this.infoMessage.set(
          "Le paiement n'a pas encore été confirmé. Votre abonnement s'activera " +
            'automatiquement : consultez « Mes abonnements » dans quelques minutes.',
        );
        return;
      }

      this.track(this.api.get<any>('/subscriptions/my-subscriptions').subscribe({
        next: (res) => {
          const subs: ClientSubscription[] = res.data || [];
          this.applySubscriptions(subs);
          if (this.destroyed || !this.awaitingInstallmentId()) return;

          const installment = subs
            .flatMap(s => s.installments ?? [])
            .find(i => i.id === installmentId);

          if (installment?.status === 'paid') {
            this.finalizeSuccess(plan);
          } else if (installment?.status === 'failed') {
            this.finalizeFailure('Le paiement a été refusé ou a échoué.');
          }
        },
        error: () => {},
      }));
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private finalizeSuccess(plan: SubscriptionPlan): void {
    this.stopPolling();
    this.wsConfirmSub?.unsubscribe();
    this.wsFailSub?.unsubscribe();
    this.wsConfirmSub = null;
    this.wsFailSub = null;
    if (this.ownsSocket) this.wsService.disconnect();

    this.subscribingId.set(null);
    this.awaitingInstallmentId.set(null);
    this.paymentGatewayUrls.set(null);
    this.infoMessage.set(null);
    this.subscribedIds.update(ids => ids.includes(plan.id) ? ids : [...ids, plan.id]);
    this.pendingIds.update(ids => ids.filter(id => id !== plan.id));
    this.successMessage.set(
      `✅ Paiement validé ! Vous êtes maintenant abonné(e) à la formule "${plan.name}".`,
    );
    setTimeout(() => { if (!this.destroyed) this.successMessage.set(null); }, 5000);

    // On repart de la source de vérité (statut serveur, dates, quota).
    this.loadMySubscriptions();
  }

  private finalizeFailure(message: string): void {
    this.stopPolling();
    this.wsConfirmSub?.unsubscribe();
    this.wsFailSub?.unsubscribe();
    this.wsConfirmSub = null;
    this.wsFailSub = null;
    if (this.ownsSocket) this.wsService.disconnect();

    this.subscribingId.set(null);
    this.awaitingInstallmentId.set(null);
    this.paymentGatewayUrls.set(null);
    this.infoMessage.set(null);
    this.errorMessage.set(message);
  }

  // ── Retour de passerelle (?status=success) ────────────────────────────

  private startGatewayReturnWatch(): void {
    this.infoMessage.set('Paiement transmis. Vérification de la confirmation en cours…');
    this.track(this.api.get<any>('/subscriptions/my-subscriptions').subscribe({
      next: (res) => this.watchGatewayReturn(res.data || []),
      error: () => this.watchGatewayReturn([]),
    }));
  }

  private watchGatewayReturn(initialSubs: ClientSubscription[]): void {
    const before = new Set(this.activePlanIds(initialSubs));
    const deadline = Date.now() + POLL_MAX_MS;

    const timer = setInterval(() => {
      if (this.destroyed) { clearInterval(timer); return; }

      this.track(this.api.get<any>('/subscriptions/my-subscriptions').subscribe({
        next: (res) => {
          const subs: ClientSubscription[] = res.data || [];
          const activated = this.activePlanIds(subs).filter(id => !before.has(id));

          if (activated.length > 0) {
            clearInterval(timer);
            this.infoMessage.set(null);
            this.applySubscriptions(subs);
            this.successMessage.set('✅ Abonnement activé ! Vos séances sont maintenant disponibles.');
            setTimeout(() => { if (!this.destroyed) this.successMessage.set(null); }, 5000);
          } else if (Date.now() > deadline) {
            clearInterval(timer);
            this.infoMessage.set(
              "Votre paiement est en cours de traitement : l'abonnement s'activera " +
                'dès la confirmation de l’opérateur.',
            );
          }
        },
        error: () => {},
      }));
    }, POLL_INTERVAL_MS);

    this.timerHandles.push(timer);
  }

  // ── Affichage ─────────────────────────────────────────────────────────

  ownerName(plan: SubscriptionPlan): string {
    if (!plan.owner) return 'Terrain partenaire';
    if (plan.owner.shop_name) return plan.owner.shop_name;
    if (plan.owner.user) return `${plan.owner.user.first_name} ${plan.owner.user.last_name}`.trim();
    return 'Terrain partenaire';
  }

  formatInstallments(plan: SubscriptionPlan): string[] {
    if (!plan.allows_moratorium || !plan.moratorium_config) return [];
    return plan.moratorium_config.map(s =>
      `${s.percentage}% à J+${s.daysAfter} (${Math.round(plan.price * s.percentage / 100).toLocaleString()} FCFA)`
    );
  }

  /** Durée de validité du pass (plus le « +1 an » codé en dur côté API). */
  formatDuration(plan: SubscriptionPlan): string {
    const days = plan.duration_days ?? 30;
    if (days % 30 === 0 && days >= 30) {
      const months = days / 30;
      return `${months} mois`;
    }
    return `${days} jours`;
  }

  isPending(planId: string): boolean {
    return this.pendingIds().includes(planId);
  }
}
