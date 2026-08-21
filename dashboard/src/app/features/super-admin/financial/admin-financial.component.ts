import { Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

@Component({
  selector: 'app-admin-financial',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, FcfaPipe],
  templateUrl: './admin-financial.component.html',
  styleUrl: './admin-financial.component.scss',
})
export class AdminFinancialComponent {
  private adminService = inject(AdminService);
  public location = inject(Location);
  transactions = this.adminService.transactions;
  withdrawalRequests = this.adminService.withdrawalRequests;
  sponsorshipWithdrawals = this.adminService.sponsorshipWithdrawals;
  monthlyRevenue = this.adminService.monthlyRevenue;
  treasuryBalance = this.adminService.treasuryBalance;
  platformWithdrawals = this.adminService.platformWithdrawals;

  // Champs du formulaire de décaissement Super Admin (Trésorerie)
  treasuryAmount: number | null = null;
  treasuryMethod: 'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY' | 'SAMIR_MONEY' = 'WAVE';
  treasuryAccountDetails: string = '';
  isSubmittingTreasury = signal(false);

  constructor() {
    this.adminService.loadTransactions();
    this.adminService.loadWithdrawals();
    this.adminService.loadSponsorshipWithdrawals();
    this.adminService.loadMonthlyRevenue();
    this.adminService.loadTreasuryBalance();
    this.adminService.loadPlatformWithdrawals();
  }

  submitPlatformWithdrawal(): void {
    if (!this.treasuryAmount || this.treasuryAmount <= 0) {
      this.actionFeedback.set({ id: 'treasury', type: 'error', message: 'Veuillez saisir un montant supérieur à 0 FCFA' });
      return;
    }
    if (!this.treasuryAccountDetails.trim()) {
      this.actionFeedback.set({ id: 'treasury', type: 'error', message: 'Veuillez renseigner le numéro de compte ou téléphone' });
      return;
    }

    this.isSubmittingTreasury.set(true);
    this.actionFeedback.set(null);

    this.adminService.withdrawPlatformTreasury(this.treasuryAmount, this.treasuryMethod, this.treasuryAccountDetails.trim()).subscribe({
      next: (res: any) => {
        this.isSubmittingTreasury.set(false);
        this.treasuryAmount = null;
        this.treasuryAccountDetails = '';
        this.adminService.loadTreasuryBalance();
        this.adminService.loadPlatformWithdrawals();
        this.actionFeedback.set({
          id: 'treasury',
          type: 'success',
          message: res.message || 'Décaissement sans frais effectué avec succès.',
        });
        setTimeout(() => this.actionFeedback.set(null), 5000);
      },
      error: (err: any) => {
        this.isSubmittingTreasury.set(false);
        this.actionFeedback.set({
          id: 'treasury',
          type: 'error',
          message: err?.error?.message ?? err?.message ?? 'Erreur lors du décaissement',
        });
      },
    });
  }

  get maxRevenue(): number {
    const vals = this.monthlyRevenue().map(m => m.value);
    return vals.length ? Math.max(...vals) : 1;
  }

  getBarHeight(value: number): number {
    return Math.round((value / this.maxRevenue) * 100);
  }

  actionFeedback = signal<{ id: string; type: 'success' | 'error'; message: string } | null>(null);

  processWithdrawal(id: string, action: 'approved' | 'rejected'): void {
    this.actionFeedback.set(null);
    this.adminService.processWithdrawal(id, action).subscribe({
      next: () => {
        this.adminService.withdrawalRequests.update(list =>
          list.map(w => w.id === id ? { ...w, status: action } : w)
        );
        this.actionFeedback.set({
          id,
          type: 'success',
          message: action === 'approved' ? 'Retrait approuvé avec succès.' : 'Retrait rejeté.',
        });
        setTimeout(() => this.actionFeedback.set(null), 4000);
      },
      error: (err: any) => {
        this.actionFeedback.set({
          id,
          type: 'error',
          message: err?.error?.message ?? 'Une erreur est survenue.',
        });
      },
    });
  }

  processSponsorshipWithdrawal(id: string, action: 'APPROVE' | 'REJECT'): void {
    this.actionFeedback.set(null);
    this.adminService.processSponsorshipWithdrawal(id, action).subscribe({
      next: () => {
        this.adminService.sponsorshipWithdrawals.update(list =>
          list.map(w => w.id === id ? { ...w, status: action === 'APPROVE' ? 'PROCESSED' : 'REJECTED' } : w)
        );
        this.actionFeedback.set({
          id,
          type: 'success',
          message: action === 'APPROVE'
            ? 'Retrait ambassadeur approuvé et validé.'
            : 'Retrait ambassadeur rejeté et solde recrédité à l\'utilisateur.',
        });
        setTimeout(() => this.actionFeedback.set(null), 4000);
      },
      error: (err: any) => {
        this.actionFeedback.set({
          id,
          type: 'error',
          message: err?.error?.message ?? 'Une erreur est survenue.',
        });
      },
    });
  }

  platformMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      WAVE: 'Wave',
      ORANGE_MONEY: 'Orange Money',
      FREE_MONEY: 'Free Money',
      SAMIR_MONEY: 'Compte Samir Money',
      OPERATOR: 'Opérateur Mobile',
    };
    return labels[method] ?? method;
  }

  methodLabel(method: string): string {
    const labels: Record<string, string> = {
      mobile_money: 'Mobile Money', orange_money: 'Orange Money', wave: 'Wave', bank_transfer: 'Virement bancaire',
    };
    return labels[method] ?? method;
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      booking_payment: 'Paiement réservation', product_sale: 'Vente produit',
      withdrawal: 'Retrait', platform_fee: 'Commission', refund: 'Remboursement',
    };
    return labels[type] ?? type;
  }
}
