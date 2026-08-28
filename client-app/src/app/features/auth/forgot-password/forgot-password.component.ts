import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [RouterLink, NgIf, FormsModule, PhoneInputComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  step = signal<'phone' | 'reset' | 'success'>('phone');
  phone = signal('');
  otpCode = signal('');
  newPin = signal('');
  confirmPin = signal('');

  loading = signal(false);
  errorMessage = signal('');

  goBack(): void {
    if (this.step() === 'reset') {
      this.step.set('phone');
      this.errorMessage.set('');
    } else {
      this.router.navigate(['/login']);
    }
  }

  onSubmitPhone(): void {
    const phoneValue = this.phone().trim();
    if (!phoneValue) {
      this.errorMessage.set('Veuillez entrer votre numéro de téléphone.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.requestPasswordReset(phoneValue).subscribe({
      next: () => {
        this.step.set('reset');
        this.loading.set(false);
      },
      error: (err: any) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Une erreur est survenue. Veuillez réessayer.');
        this.loading.set(false);
      },
    });
  }

  onSubmitReset(): void {
    this.errorMessage.set('');

    const otp = this.otpCode().trim();
    if (!otp || otp.length < 6) {
      this.errorMessage.set('Veuillez saisir le code OTP à 6 chiffres reçu par SMS.');
      return;
    }

    const pin = this.newPin().trim();
    if (!pin || pin.length !== 4) {
      this.errorMessage.set('Le nouveau code PIN doit comporter 4 chiffres.');
      return;
    }

    if (pin !== this.confirmPin().trim()) {
      this.errorMessage.set('Les codes PIN ne correspondent pas.');
      return;
    }

    this.loading.set(true);
    this.authService.resetPassword({
      phone: this.phone().trim(),
      otp: otp,
      newPassword: pin,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.step.set('success');
      },
      error: (err: any) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Code OTP invalide ou expiré.');
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
