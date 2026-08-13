import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
  allows_moratorium: boolean;
  moratorium_config?: MoratoriumStep[];
  owner?: { id: string; shop_name?: string; user?: { first_name: string; last_name: string } };
}

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './subscriptions.component.html',
  styleUrls: ['./subscriptions.component.scss']
})
export class SubscriptionsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private wsService = inject(WebSocketService);

  plans = signal<SubscriptionPlan[]>([]);
  isLoading = signal(true);
  subscribingId = signal<string | null>(null);
  subscribedIds = signal<string[]>([]);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  paymentGatewayUrls = signal<any>(null);
  awaitingInstallmentId = signal<string | null>(null);

  selectedPlanForPayment = signal<SubscriptionPlan | null>(null);
  operator = signal<'WAVE' | 'OM'>('WAVE');
  phone = signal('');

  ngOnInit(): void {
    this.api.get<any>('/subscriptions/plans/all').subscribe({
      next: (res) => {
        this.plans.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Impossible de charger les formules.');
        this.isLoading.set(false);
      }
    });
  }

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

    this.api.post<any>('/subscriptions/subscribe', { 
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

           this.wsService.connect();
           this.wsService.joinBooking(firstInstallment.id);

           const wsSub = this.wsService.onPaymentConfirmed().subscribe(() => {
              this.wsService.disconnect();
              wsSub.unsubscribe();
              this.subscribingId.set(null);
              this.awaitingInstallmentId.set(null);
              this.subscribedIds.update(ids => [...ids, plan.id]);
              this.successMessage.set(`✅ Paiement validé ! Vous êtes maintenant abonné(e) à la formule "${plan.name}".`);
              setTimeout(() => this.successMessage.set(null), 5000);
           });

           const wsFail = this.wsService.onPaymentFailed().subscribe(() => {
              this.wsService.disconnect();
              wsFail.unsubscribe();
              this.subscribingId.set(null);
              this.awaitingInstallmentId.set(null);
              this.errorMessage.set('Le paiement a été refusé ou a échoué.');
           });

           if (!/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
              window.open(redirectUrl, '_blank');
           } else {
              window.location.href = redirectUrl;
           }
        } else {
           this.subscribingId.set(null);
           this.subscribedIds.update(ids => [...ids, plan.id]);
           this.successMessage.set(`✅ Vous avez souscrit à la formule "${plan.name}" !`);
           setTimeout(() => this.successMessage.set(null), 5000);
        }
      },
      error: (err) => {
        this.subscribingId.set(null);
        this.errorMessage.set(err.error?.message || 'Erreur lors de la souscription.');
      }
    });
  }

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
}
