import { Component, inject, OnInit, signal, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SponsorshipService, SponsorshipMyStats } from '../../../core/services/sponsorship.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-ambassador-wallet',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ambassador-wallet.component.html',
  styleUrl: './ambassador-wallet.component.scss',
})
export class AmbassadorWalletComponent implements OnInit, OnDestroy {
  private sponsorshipService = inject(SponsorshipService);
  private authService = inject(AuthService);

  @ViewChild('linkInput') linkInput!: ElementRef<HTMLInputElement>;

  readonly currentUser = this.authService.currentUser;

  loading = signal(true);
  error = signal<string | null>(null);
  stats = signal<SponsorshipMyStats | null>(null);
  copied = signal(false);

  // État du modal de retrait et sécurité OTP
  showWithdrawModal = signal(false);
  withdrawAmount = signal<number | null>(null);
  withdrawPhone = signal<string>('');
  withdrawOperator = signal<string>('Wave');
  withdrawOtp = signal<string>('');
  isSendingOtp = signal(false);
  otpSent = signal(false);
  otpCountdown = signal(0);
  private timerHandle: any = null;

  isSubmittingWithdraw = signal(false);
  withdrawSuccessMessage = signal<string | null>(null);
  withdrawErrorMessage = signal<string | null>(null);

  get referralLink(): string {
    const code = this.stats()?.referral_code ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/register?ref=${code}`;
  }

  get whatsappUrl(): string {
    const text = encodeURIComponent(
      `Rejoins EasyArena et réserve tes terrains sportifs ! Inscris-toi avec mon lien de parrainage : ${this.referralLink}`,
    );
    return `https://wa.me/?text=${text}`;
  }

  get smsUrl(): string {
    const text = encodeURIComponent(
      `Rejoins EasyArena avec mon lien : ${this.referralLink}`,
    );
    return `sms:?&body=${text}`;
  }

  get supportWhatsappUrl(): string {
    const code = this.stats()?.referral_code ?? '';
    const balance = this.stats()?.wallet_balance ?? 0;
    const text = encodeURIComponent(
      `Bonjour EasyArena Support, je suis l'Ambassadeur (Code: ${code}, Solde: ${balance} FCFA). J'ai une question concernant mes commissions / mon retrait.`
    );
    return `https://wa.me/221773780756?text=${text}`;
  }

  ngOnInit(): void {
    this.fetchStats();
  }

  ngOnDestroy(): void {
    if (this.timerHandle) clearInterval(this.timerHandle);
  }

  fetchStats(): void {
    this.sponsorshipService.getMyStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Service momentanément indisponible. Réessayez plus tard.');
        this.loading.set(false);
      },
    });
  }

  // ── GESTION DU RETRAIT MOBILE MONEY & OTP ────────────────────────────
  openWithdrawModal(): void {
    const currentBalance = this.stats()?.wallet_balance ?? 0;
    if (currentBalance <= 0) return;

    this.withdrawAmount.set(currentBalance);
    this.withdrawPhone.set(this.currentUser()?.phone ?? '');
    this.withdrawOperator.set('Wave');
    this.withdrawOtp.set('');
    this.otpSent.set(false);
    this.withdrawErrorMessage.set(null);
    this.withdrawSuccessMessage.set(null);
    this.showWithdrawModal.set(true);
  }

  closeWithdrawModal(): void {
    this.showWithdrawModal.set(false);
    this.withdrawErrorMessage.set(null);
    this.withdrawSuccessMessage.set(null);
    this.withdrawOtp.set('');
    this.otpSent.set(false);
  }

  setMaxAmount(): void {
    const currentBalance = this.stats()?.wallet_balance ?? 0;
    this.withdrawAmount.set(currentBalance);
  }

  requestOtp(): void {
    const amount = Number(this.withdrawAmount());
    const phone = this.withdrawPhone().trim();
    const currentBalance = this.stats()?.wallet_balance ?? 0;

    if (!amount || amount <= 0) {
      this.withdrawErrorMessage.set('Veuillez saisir un montant valide supérieur à 0.');
      return;
    }

    if (amount > currentBalance) {
      this.withdrawErrorMessage.set(`Le montant dépasse votre solde disponible (${this.formatCFA(currentBalance)}).`);
      return;
    }

    if (!phone) {
      this.withdrawErrorMessage.set('Veuillez renseigner un numéro de téléphone de réception.');
      return;
    }

    this.isSendingOtp.set(true);
    this.withdrawErrorMessage.set(null);

    this.sponsorshipService.sendWithdrawOtp().subscribe({
      next: () => {
        this.isSendingOtp.set(false);
        this.otpSent.set(true);
        this.startOtpCountdown(60);
      },
      error: (err) => {
        this.isSendingOtp.set(false);
        this.withdrawErrorMessage.set(err?.error?.message || 'Erreur lors de l\'envoi du code OTP.');
      },
    });
  }

  private startOtpCountdown(seconds: number): void {
    this.otpCountdown.set(seconds);
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.timerHandle = setInterval(() => {
      const cur = this.otpCountdown();
      if (cur <= 1) {
        clearInterval(this.timerHandle);
        this.otpCountdown.set(0);
      } else {
        this.otpCountdown.set(cur - 1);
      }
    }, 1000);
  }

  submitWithdrawal(): void {
    const amount = Number(this.withdrawAmount());
    const phone = this.withdrawPhone().trim();
    const operator = this.withdrawOperator();
    const otp_code = this.withdrawOtp().trim();
    const currentBalance = this.stats()?.wallet_balance ?? 0;

    if (!amount || amount <= 0) {
      this.withdrawErrorMessage.set('Veuillez saisir un montant valide supérieur à 0.');
      return;
    }

    if (amount > currentBalance) {
      this.withdrawErrorMessage.set(`Le montant dépasse votre solde disponible (${this.formatCFA(currentBalance)}).`);
      return;
    }

    if (!phone) {
      this.withdrawErrorMessage.set('Veuillez renseigner un numéro de téléphone de réception.');
      return;
    }

    if (!otp_code || otp_code.length !== 6) {
      this.withdrawErrorMessage.set('Veuillez saisir le code de vérification OTP à 6 chiffres reçu par SMS.');
      return;
    }

    this.isSubmittingWithdraw.set(true);
    this.withdrawErrorMessage.set(null);
    this.withdrawSuccessMessage.set(null);

    this.sponsorshipService.withdraw({ amount, phone, operator, otp_code }).subscribe({
      next: (res) => {
        this.isSubmittingWithdraw.set(false);
        this.withdrawSuccessMessage.set(res?.message || 'Votre demande de retrait a été enregistrée avec succès.');
        
        // Mettre à jour le solde localement
        if (this.stats()) {
          this.stats.update((s) => s ? { ...s, wallet_balance: Math.max(0, s.wallet_balance - amount) } : null);
        }

        setTimeout(() => {
          this.closeWithdrawModal();
        }, 2000);
      },
      error: (err) => {
        this.isSubmittingWithdraw.set(false);
        this.withdrawErrorMessage.set(err?.error?.message || err?.message || 'Échec de la demande de retrait.');
      },
    });
  }

  // ── EXPORT CSV DES FILLEULS (N1 + N2 FUSIONNÉS) ───────────────────────
  exportReferralsCsv(): void {
    const referrals = this.stats()?.referrals || [];
    if (referrals.length === 0) return;

    const headers = ['Nom Filleul', 'Niveau', 'Rôle', 'Date Inscription'];
    const rows = referrals.map((r) => [
      `"${(r.referee_name || '').replace(/"/g, '""')}"`,
      `"N${r.level || 1}"`,
      `"${(r.referee_role || 'Membre').replace(/"/g, '""')}"`,
      `"${new Date(r.created_at).toLocaleDateString('fr-FR')}"`,
    ]);

    // Ajout du BOM UTF-8 pour ouverture propre dans Excel
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `mes-filleuls-easyarena-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  copyLink(): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.referralLink).then(
        () => this.showCopied(),
        () => this.fallbackCopy(),
      );
    } else {
      this.fallbackCopy();
    }
  }

  private fallbackCopy(): void {
    const input = this.linkInput?.nativeElement;
    if (input) {
      input.select();
      input.setSelectionRange(0, 99999);
      document.execCommand('copy');
      this.showCopied();
    }
  }

  private showCopied(): void {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2500);
  }

  formatCFA(amount: number): string {
    if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1) + 'M FCFA';
    if (amount >= 10_000) return (amount / 1_000).toFixed(0) + 'k FCFA';
    return amount.toLocaleString('fr-FR') + ' FCFA';
  }
}