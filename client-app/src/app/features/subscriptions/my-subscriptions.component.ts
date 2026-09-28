import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription as RxSubscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ClientSubscription, SubscriptionPlan } from './subscriptions.component';

/** BLOC 2 — Fallback de vérification après retour de passerelle. */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 30000;

type StatusLabel = { label: string; cls: string; icon: string };

const STATUS_META: Record<string, StatusLabel> = {
  active: { label: 'Actif', cls: 'is-active', icon: 'check_circle' },
  pending: { label: 'En attente de paiement', cls: 'is-pending', icon: 'hourglass_top' },
  suspended: { label: 'Suspendu', cls: 'is-suspended', icon: 'pause_circle' },
  expired: { label: 'Expiré', cls: 'is-expired', icon: 'event_busy' },
  completed: { label: 'Terminé', cls: 'is-completed', icon: 'task_alt' },
  cancelled: { label: 'Annulé', cls: 'is-cancelled', icon: 'cancel' },
};

const INSTALLMENT_META: Record<string, StatusLabel> = {
  paid: { label: 'Payée', cls: 'is-active', icon: 'check_circle' },
  pending: { label: 'À régler', cls: 'is-pending', icon: 'schedule' },
  overdue: { label: 'Impayée', cls: 'is-suspended', icon: 'error' },
  failed: { label: 'Échec', cls: 'is-cancelled', icon: 'cancel' },
};

/**
 * BLOC 2 — « Mes Abonnements ».
 *
 * `GET /subscriptions/my-subscriptions` n'était **jamais** appelé côté client :
 * `subscribedIds` restait vide à chaque affichage, et aucun écran ne montrait
 * le quota consommé, les dates de validité ni l'échéancier. C'est aussi la
 * page de retour de la passerelle (`returnUrl ?status=success`).
 */
@Component({
  selector: 'app-my-subscriptions',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-subscriptions.component.html',
  styleUrls: ['./my-subscriptions.component.scss'],
})
export class MySubscriptionsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  subs = signal<ClientSubscription[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  infoMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  private destroyed = false;
  private apiSubs: RxSubscription[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];

  ngOnInit(): void {
    if (!this.auth.isAuthenticated()) {
      this.errorMessage.set('Connectez-vous pour consulter vos abonnements.');
      this.isLoading.set(false);
      return;
    }

    this.load();

    if (this.route.snapshot.queryParamMap.get('status') === 'success') {
      this.startGatewayReturnWatch();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.timers.forEach(t => clearInterval(t));
    this.apiSubs.forEach(s => s.unsubscribe());
  }

  load(): void {
    this.isLoading.set(this.subs().length === 0);
    this.apiSubs.push(this.api.get<any>('/subscriptions/my-subscriptions').subscribe({
      next: (res) => {
        this.subs.set(res.data || []);
        this.isLoading.set(false);
        this.errorMessage.set(null);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Impossible de charger vos abonnements.',
        );
      },
    }));
  }

  /**
   * Retour de passerelle : on ne connaît plus l'id d'échéance (la page a été
   * rechargée), on attend donc l'apparition d'un abonnement qui n'était pas
   * encore actif. 30 s max, puis on laisse l'utilisateur tranquille.
   */
  private startGatewayReturnWatch(): void {
    this.infoMessage.set('Paiement transmis. Vérification de la confirmation en cours…');

    const before = new Set(this.activeIds());
    const deadline = Date.now() + POLL_MAX_MS;

    const timer = setInterval(() => {
      if (this.destroyed) { clearInterval(timer); return; }

      this.apiSubs.push(this.api.get<any>('/subscriptions/my-subscriptions').subscribe({
        next: (res) => {
          const list: ClientSubscription[] = res.data || [];
          const activated = this.activeIdsOf(list).filter(id => !before.has(id));

          if (activated.length > 0) {
            clearInterval(timer);
            this.subs.set(list);
            this.infoMessage.set(null);
            this.successMessage.set('✅ Abonnement activé ! Vos séances sont maintenant disponibles.');
            setTimeout(() => { if (!this.destroyed) this.successMessage.set(null); }, 5000);
          } else if (Date.now() > deadline) {
            clearInterval(timer);
            this.subs.set(list);
            this.infoMessage.set(
              "Votre paiement est en cours de traitement : l'abonnement s'activera " +
                'dès la confirmation de l’opérateur.',
            );
          }
        },
        error: () => {},
      }));
    }, POLL_INTERVAL_MS);

    this.timers.push(timer);
  }

  private activeIds(): string[] {
    return this.activeIdsOf(this.subs());
  }

  private activeIdsOf(list: ClientSubscription[]): string[] {
    return [...new Set(list.filter(s => s.status === 'active').map(s => s.plan_id))];
  }

  // ── Aides d'affichage ─────────────────────────────────────────────────

  statusOf(sub: ClientSubscription): StatusLabel {
    return STATUS_META[sub.status] ?? { label: sub.status, cls: '', icon: 'help' };
  }

  installmentStatusOf(status: string): StatusLabel {
    return INSTALLMENT_META[status] ?? { label: status, cls: '', icon: 'help' };
  }

  planName(sub: ClientSubscription): string {
    return sub.plan?.name ?? 'Formule';
  }

  ownerName(sub: ClientSubscription): string {
    const owner = sub.plan?.owner;
    if (!owner) return 'Terrain partenaire';
    if (owner.shop_name) return owner.shop_name;
    if (owner.user) return `${owner.user.first_name} ${owner.user.last_name}`.trim();
    return 'Terrain partenaire';
  }

  quotaTotal(sub: ClientSubscription): number {
    return sub.plan?.reservations_count ?? 0;
  }

  quotaUsed(sub: ClientSubscription): number {
    return Math.min(sub.reservations_used ?? 0, this.quotaTotal(sub));
  }

  quotaRemaining(sub: ClientSubscription): number {
    return Math.max(0, this.quotaTotal(sub) - this.quotaUsed(sub));
  }

  /** Jauge de consommation en % (0 → 100 une fois le pass épuisé). */
  quotaPercent(sub: ClientSubscription): number {
    const total = this.quotaTotal(sub);
    if (!total) return 0;
    return Math.min(100, Math.round((this.quotaUsed(sub) / total) * 100));
  }

  durationLabel(sub: ClientSubscription): string {
    const days = sub.plan?.duration_days ?? 30;
    if (days % 30 === 0 && days >= 30) return `${days / 30} mois`;
    return `${days} jours`;
  }

  private formatDate(value?: string | Date | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  startDate = (sub: ClientSubscription) => this.formatDate(sub.start_date);
  endDate = (sub: ClientSubscription) => this.formatDate(sub.end_date);
  dueDate = (s: { due_date: string }) => this.formatDate(s.due_date);

  /**
   * Un abonnement à échéances n'est « en retard » que si sa première échéance
   * est toujours à régler : `pending` ne suffit pas (l'échéancier peut être
   * déjà soldé).
   */
  hasDueInstallment(sub: ClientSubscription): boolean {
    return (sub.installments ?? []).some(
      i => i.status === 'pending' || i.status === 'overdue',
    );
  }

  totalDue(sub: ClientSubscription): number {
    return (sub.installments ?? [])
      .filter(i => i.status === 'pending' || i.status === 'overdue')
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);
  }
}
