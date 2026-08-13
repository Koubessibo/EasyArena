import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../core/services/field-owner.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExportService } from '../../../core/services/export.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

@Component({
  selector: 'app-owner-earnings',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, DatePipe, FormsModule, PageHeaderComponent, FcfaPipe, PhoneInputComponent],
  templateUrl: './owner-earnings.component.html',
  styleUrl: './owner-earnings.component.scss',
})
export class OwnerEarningsComponent {
  private svc = inject(FieldOwnerService);
  private auth = inject(AuthService);
  private exportSvc = inject(ExportService);

  balance = this.svc.balance;
  weeklyEarnings = this.svc.weeklyEarnings;
  transactions = this.svc.transactions;
  withdrawals = this.svc.withdrawals;

  readonly totalGrossRevenue = computed(() => {
    return this.transactions()
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
  });

  readonly totalWithdrawals = computed(() => {
    return this.transactions()
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  });

  readonly canWithdraw = computed(() => {
    const u = this.auth.currentUser();
    if (!u) return false;
    if (u.role === 'controller') return u.can_withdraw === true;
    return true;
  });

  // Withdraw modal state
  showWithdrawModal = signal(false);
  withdrawStep = signal<'form' | 'otp'>('form');
  withdrawMethod = signal<'mobile_money' | 'bank_transfer'>('mobile_money');
  withdrawAmount = signal(0);
  readonly withdrawFee = computed(() => 0);
  readonly withdrawTotal = computed(() => this.withdrawAmount() + this.withdrawFee());
  withdrawOperator = signal<string>('WAVE');
  withdrawPhone = signal<string>('');
  withdrawDestination = signal<string>('');
  withdrawError = signal<string>('');
  withdrawLoading = signal(false);
  otpCode = signal('');
  otpSending = signal(false);
  ribFile = signal<File | null>(null);
  ribUrl = signal<string>('');
  ribUploading = signal(false);

  constructor() {
    this.svc.loadBalance();
    this.svc.loadTransactions();
    this.svc.loadWithdrawals();
    const stored = localStorage.getItem('xeweul_dash_user');
    if (stored) this.withdrawPhone.set(JSON.parse(stored).phone ?? '');
  }

  exportPdf(): void {
    const headers = ['Réf/ID', 'Date', 'Type', 'Description', 'Montant (FCFA)'];
    const rows = this.transactions().map(t => [
      t.id.slice(0, 8),
      t.createdAt ? new Date(t.createdAt).toLocaleDateString('fr-FR') : '-',
      t.type,
      t.description || '-',
      t.amount
    ]);
    this.exportSvc.exportToPdf('Rapport Financier & Gains', headers, rows, 'rapport-financier.pdf');
  }

  exportExcel(): void {
    const headers = ['ID Transaction', 'Date', 'Type', 'Description', 'Montant (FCFA)'];
    const rows = this.transactions().map(t => [
      t.id,
      t.createdAt ? new Date(t.createdAt).toLocaleDateString('fr-FR') : '-',
      t.type,
      t.description || '-',
      t.amount
    ]);
    this.exportSvc.exportToExcel('Revenus & Transactions', headers, rows, 'rapport-financier.xlsx');
  }

  openWithdrawModal(): void {
    this.withdrawError.set('');
    this.withdrawAmount.set(0);
    this.withdrawStep.set('form');
    this.withdrawMethod.set('mobile_money');
    this.otpCode.set('');
    this.ribFile.set(null);
    this.ribUrl.set('');
    this.withdrawDestination.set('');
    this.showWithdrawModal.set(true);
  }

  closeWithdrawModal(): void {
    this.showWithdrawModal.set(false);
    this.withdrawError.set('');
  }

  get maxEarning(): number {
    return Math.max(...this.weeklyEarnings().map(e => e.value));
  }

  getBarHeight(value: number): number {
    return Math.round((value / this.maxEarning) * 100);
  }

  onRibFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.ribFile.set(file);
    this.ribUploading.set(true);
    this.svc.uploadRib(file).subscribe({
      next: (res) => { this.ribUrl.set(res.url); this.ribUploading.set(false); },
      error: () => { this.withdrawError.set('Erreur lors de l\'upload du RIB.'); this.ribUploading.set(false); },
    });
  }

  sendOtp(): void {
    const amount = this.withdrawAmount();
    const method = this.withdrawMethod();

    if (amount < 50) {
      this.withdrawError.set('Le montant minimum est de 50 FCFA.');
      return;
    }
    if (this.withdrawTotal() > this.balance()) {
      this.withdrawError.set(`Solde insuffisant. Total à débiter (frais inclus) : ${this.withdrawTotal()} FCFA.`);
      return;
    }
    if (method === 'mobile_money' && !this.withdrawPhone().trim()) {
      this.withdrawError.set('Veuillez saisir un numéro de téléphone.');
      return;
    }
    if (method === 'bank_transfer' && !this.withdrawDestination().trim()) {
      this.withdrawError.set('Veuillez saisir les coordonnées bancaires.');
      return;
    }
    if (method === 'bank_transfer' && !this.ribUrl() && !this.ribUploading()) {
      this.withdrawError.set('Veuillez joindre votre RIB.');
      return;
    }

    this.withdrawError.set('');
    this.otpSending.set(true);
    this.svc.sendWithdrawalOtp().subscribe({
      next: () => {
        this.otpSending.set(false);
        this.withdrawStep.set('otp');
      },
      error: (err: any) => {
        this.otpSending.set(false);
        this.withdrawError.set(err?.error?.message ?? 'Erreur lors de l\'envoi de l\'OTP.');
      },
    });
  }

  resendOtp(): void {
    this.otpSending.set(true);
    this.svc.sendWithdrawalOtp().subscribe({
      next: () => this.otpSending.set(false),
      error: () => this.otpSending.set(false),
    });
  }

  requestWithdraw(): void {
    const code = this.otpCode().trim();
    if (code.length < 6) {
      this.withdrawError.set('Veuillez saisir le code OTP à 6 chiffres.');
      return;
    }

    const method = this.withdrawMethod();
    const destination = method === 'mobile_money'
      ? this.withdrawPhone().trim()
      : this.withdrawDestination().trim();
    const operator = method === 'mobile_money' ? this.withdrawOperator() : null;

    this.withdrawError.set('');
    this.withdrawLoading.set(true);
    this.svc.requestWithdrawal(
      this.withdrawAmount(),
      method,
      destination,
      operator,
      code,
      method === 'bank_transfer' ? this.ribUrl() : undefined,
    ).subscribe({
      next: () => {
        this.withdrawLoading.set(false);
        this.showWithdrawModal.set(false);
        this.svc.loadBalance();
        this.svc.loadTransactions();
        this.svc.loadWithdrawals();
      },
      error: (err: any) => {
        this.withdrawLoading.set(false);
        this.withdrawError.set(err?.error?.message ?? 'Une erreur est survenue.');
      },
    });
  }

}
