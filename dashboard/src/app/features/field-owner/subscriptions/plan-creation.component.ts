import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

/**
 * Validateur synchrone pour vérifier que la somme des pourcentages du FormArray vaut exactement 100
 */
export function moratoriumSumValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const steps = control.value;
    if (!Array.isArray(steps) || steps.length === 0) return null;
    
    const sum = steps.reduce((acc, step) => acc + (Number(step.percentage) || 0), 0);
    return sum === 100 ? null : { invalidSum: { currentSum: sum } };
  };
}

@Component({
  selector: 'app-plan-creation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './plan-creation.component.html',
  styleUrls: ['./plan-creation.component.scss'],
})
export class PlanCreationComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);
  public location = inject(Location);

  isSubmitting = signal(false);
  submitSuccess = signal<string | null>(null);
  submitError = signal<string | null>(null);

  myPlans = signal<any[]>([]);
  editingPlanId = signal<string | null>(null);

  planForm: FormGroup;

  constructor() {
    this.planForm = this.fb.group({
      name: ['', Validators.required],
      price: [null, [Validators.required, Validators.min(0)]],
      reservations_count: [null, [Validators.required, Validators.min(1)]],
      allows_moratorium: [false],
      moratorium_config: this.fb.array([], moratoriumSumValidator()),
    });

    // Écouter les changements du toggle pour ajouter/retirer dynamiquement une étape de base
    this.planForm.get('allows_moratorium')?.valueChanges.subscribe((allows) => {
      if (allows) {
        if (this.moratoriumConfig.length === 0) {
          this.addMoratoriumStep(50, 0);
          this.addMoratoriumStep(50, 30);
        }
      }
    });
  }

  ngOnInit(): void {
    this.fetchMyPlans();
  }

  fetchMyPlans(): void {
    this.api.get<any>('/subscriptions/plans/owner/my-plans').subscribe({
      next: (res) => {
        this.myPlans.set(res.data || []);
      }
    });
  }

  get moratoriumConfig(): FormArray {
    return this.planForm.get('moratorium_config') as FormArray;
  }

  addMoratoriumStep(percentage: number = 0, daysAfter: number = 0): void {
    const stepGroup = this.fb.group({
      percentage: [percentage, [Validators.required, Validators.min(1), Validators.max(100)]],
      daysAfter: [daysAfter, [Validators.required, Validators.min(0)]],
    });
    this.moratoriumConfig.push(stepGroup);
  }

  removeMoratoriumStep(index: number): void {
    this.moratoriumConfig.removeAt(index);
  }

  openEditPlan(plan: any): void {
    this.editingPlanId.set(plan.id);
    this.moratoriumConfig.clear();

    this.planForm.patchValue({
      name: plan.name,
      price: plan.price,
      reservations_count: plan.reservations_count,
      allows_moratorium: !!plan.allows_moratorium,
    });

    if (plan.allows_moratorium && Array.isArray(plan.moratorium_config)) {
      for (const step of plan.moratorium_config) {
        this.addMoratoriumStep(step.percentage, step.daysAfter);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingPlanId.set(null);
    this.planForm.reset({ allows_moratorium: false });
    this.moratoriumConfig.clear();
  }

  deletePlan(id: string): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce plan d\'abonnement ?')) {
      this.api.delete<any>(`/subscriptions/plans/${id}`).subscribe({
        next: () => {
          this.myPlans.update(list => list.filter(p => p.id !== id));
          this.submitSuccess.set('Plan d\'abonnement supprimé avec succès.');
          setTimeout(() => this.submitSuccess.set(null), 3000);
        }
      });
    }
  }

  onSubmit(): void {
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.planForm.markAllAsTouched();

    if (this.planForm.invalid) {
      if (this.planForm.get('allows_moratorium')?.value && this.moratoriumConfig.errors?.['invalidSum']) {
        this.submitError.set('La somme des pourcentages des échéances doit être exactement égale à 100%.');
      } else {
        this.submitError.set('Veuillez remplir correctement tous les champs obligatoires.');
      }
      return;
    }

    this.isSubmitting.set(true);

    const rawValue = this.planForm.value;
    const payload = {
      name: rawValue.name,
      price: Number(rawValue.price),
      reservations_count: Number(rawValue.reservations_count),
      allows_moratorium: rawValue.allows_moratorium,
      moratorium_config: rawValue.allows_moratorium ? rawValue.moratorium_config : undefined,
    };

    const editId = this.editingPlanId();
    if (editId) {
      this.api.put<any>(`/subscriptions/plans/${editId}`, payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitSuccess.set('Formule d\'abonnement mise à jour avec succès !');
          this.cancelEdit();
          this.fetchMyPlans();
          setTimeout(() => this.submitSuccess.set(null), 4000);
        },
        error: (err: Error) => {
          this.isSubmitting.set(false);
          this.submitError.set(err.message || 'Erreur lors de la mise à jour.');
        }
      });
    } else {
      this.api.post<any>('/subscriptions/plans', payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitSuccess.set('Formule d\'abonnement créée avec succès !');
          this.cancelEdit();
          this.fetchMyPlans();
          setTimeout(() => this.submitSuccess.set(null), 4000);
        },
        error: (err: Error) => {
          this.isSubmitting.set(false);
          this.submitError.set(err.message || 'Une erreur est survenue lors de la création.');
        },
      });
    }
  }
}
