import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

export interface EarningsDashboard {
  totalRevenue: number;
  availableBalance: number;
  recentTransactions: any[];
}

@Component({
  selector: 'app-vendor-earnings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vendor-earnings.component.html',
  styleUrls: ['./vendor-earnings.component.scss']
})
export class VendorEarningsComponent implements OnInit {
  private api = inject(ApiService);
  public location = inject(Location);

  dashboardData = signal<EarningsDashboard | null>(null);
  isLoading = signal(true);
  
  isWithdrawModalOpen = signal(false);
  isSubmitting = signal(false);
  withdrawAmount = signal<number | null>(null);
  withdrawPhone = signal<string>('');
  withdrawOperator = signal<string>('wave');
  
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  readonly operators = [
    { value: 'wave', label: 'Wave', color: '#1dc5db' },
    { value: 'orange_money', label: 'Orange Money', color: '#ff6600' },
    { value: 'free_money', label: 'Free Money', color: '#e2001a' },
  ];

  totalRevenue = computed(() => this.dashboardData()?.totalRevenue || 0);
  availableBalance = computed(() => this.dashboardData()?.availableBalance || 0);
  recentTransactions = computed(() => this.dashboardData()?.recentTransactions || []);

  ngOnInit(): void {
    this.fetchEarnings();
  }

  fetchEarnings(): void {
    this.isLoading.set(true);
    this.api.get<any>('/vendor/earnings').subscribe({
      next: (res) => {
        this.dashboardData.set(res.data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  openWithdrawModal(): void {
    this.withdrawAmount.set(null);
    this.withdrawPhone.set('');
    this.withdrawOperator.set('wave');
    this.isWithdrawModalOpen.set(true);
  }

  closeWithdrawModal(): void {
    this.isWithdrawModalOpen.set(false);
  }

  requestWithdrawal(): void {
    const amount = this.withdrawAmount();
    if (!amount || amount < 500) {
      this.errorMessage.set('Le montant minimum de retrait est de 500 FCFA.');
      return;
    }

    if (amount > this.availableBalance()) {
      this.errorMessage.set('Solde disponible insuffisant pour effectuer ce retrait.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = {
      amount,
      phone: this.withdrawPhone(),
      operator: this.withdrawOperator()
    };

    this.api.post<any>('/vendor/withdraw', payload).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.successMessage.set(res.message || 'Demande de retrait transmise avec succès !');
        this.closeWithdrawModal();
        this.fetchEarnings();
        setTimeout(() => this.successMessage.set(null), 6000);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.message || 'Erreur lors de la demande de retrait.');
      }
    });
  }
}
