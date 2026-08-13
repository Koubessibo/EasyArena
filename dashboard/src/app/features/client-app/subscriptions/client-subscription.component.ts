import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

export interface MoratoriumStep {
  percentage: number;
  daysAfter: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  reservations_count: number;
  allows_moratorium: boolean;
  moratorium_config?: MoratoriumStep[];
}

@Component({
  selector: 'app-client-subscription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-subscription.component.html',
  styleUrls: ['./client-subscription.component.scss'],
})
export class ClientSubscriptionComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  plans = signal<SubscriptionPlan[]>([]);
  isLoading = signal(true);
  submittingPlanId = signal<string | null>(null);
  subscribedPlanIds = signal<string[]>([]);

  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  fieldId: string | null = null;

  ngOnInit(): void {
    // Dans l'URL type /client/fields/:fieldId/subscriptions ou similaire
    // On extrait le paramètre (si présent) ou on l'adapte selon la vraie structure
    this.fieldId = this.route.snapshot.paramMap.get('fieldId') || this.route.snapshot.queryParamMap.get('fieldId');
    
    // Fallback: si l'API requiert ownerId au lieu de fieldId, on suppose que fieldId sert de référence
    const idToFetch = this.fieldId || 'default';
    this.fetchPlans(idToFetch);
  }

  fetchPlans(fieldId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // On appelle la route backend (qui devra exister côté NestJS)
    this.api.get<any>(`/subscriptions/plans/${fieldId}`).subscribe({
      next: (res) => {
        this.plans.set(res.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur lors de la récupération des formules', err);
        this.errorMessage.set('Impossible de charger les formules.');
        this.isLoading.set(false);
      },
    });
  }

  subscribeToPlan(plan: SubscriptionPlan): void {
    if (this.submittingPlanId()) return;

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.submittingPlanId.set(plan.id);

    this.api.post<any>('/subscriptions/subscribe', { plan_id: plan.id }).subscribe({
      next: (res) => {
        this.submittingPlanId.set(null);
        this.subscribedPlanIds.update(ids => [...ids, plan.id]);
        this.successMessage.set(`Félicitations ! Vous avez souscrit à la formule "${plan.name}".`);
      },
      error: (err) => {
        this.submittingPlanId.set(null);
        this.errorMessage.set(err.message || 'Une erreur est survenue lors de la souscription.');
      },
    });
  }
}
