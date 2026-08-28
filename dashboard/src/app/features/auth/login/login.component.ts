import { Component, signal, inject, effect } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [NgIf, FormsModule, PhoneInputComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  auth = inject(AuthService);

  phone = signal('');
  pin = signal('');

  step = signal<'credentials' | 'forgot-phone' | 'reset-form' | 'otp' | 'new-pin'>('credentials');
  otpCode = signal('');
  newPin = signal('');
  confirmPin = signal('');
  pinError = signal('');
  forgotPhone = signal('');
  successToast = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.mustChangePin()) {
        this.step.set('otp');
      }
    });
  }

  submit(): void {
    if (!this.phone() || !this.pin()) return;
    this.auth.login(this.phone(), this.pin());
  }

  submitForgotPin(): void {
    if (!this.forgotPhone()) return;
    this.auth.error.set(null);
    this.auth.loading.set(true);
    this.auth.forgotPassword(this.forgotPhone()).subscribe({
      next: () => {
        this.auth.loading.set(false);
        this.otpCode.set('');
        this.newPin.set('');
        this.confirmPin.set('');
        this.pinError.set('');
        this.step.set('reset-form');
      },
      error: (err: any) => {
        this.auth.loading.set(false);
        this.auth.error.set(err?.error?.message || err?.message || 'Numéro introuvable.');
      },
    });
  }

  submitResetPassword(): void {
    this.pinError.set('');
    this.auth.error.set(null);

    const otp = this.otpCode().trim();
    if (!otp || otp.length < 6) {
      this.pinError.set('Veuillez saisir le code OTP à 6 chiffres reçu par SMS.');
      return;
    }

    const pin = this.newPin().trim();
    if (!pin || pin.length !== 4) {
      this.pinError.set('Le nouveau code PIN doit comporter 4 chiffres.');
      return;
    }

    if (pin !== this.confirmPin().trim()) {
      this.pinError.set('Les codes PIN ne correspondent pas.');
      return;
    }

    this.auth.loading.set(true);
    this.auth.resetPassword({
      phone: this.forgotPhone(),
      otp: otp,
      newPassword: pin,
    }).subscribe({
      next: () => {
        this.auth.loading.set(false);
        this.successToast.set('Votre code PIN a été modifié avec succès. Connectez-vous maintenant.');
        this.step.set('credentials');
        this.phone.set(this.forgotPhone());
        this.pin.set('');
        this.forgotPhone.set('');
        setTimeout(() => this.successToast.set(null), 6000);
      },
      error: (err: any) => {
        this.auth.loading.set(false);
        this.pinError.set(err?.error?.message || err?.message || 'Code OTP invalide ou expiré.');
      },
    });
  }

  submitOtp(): void {
    if (this.otpCode().length < 6) return;
    this.auth.verifyOtpForPinChange(this.otpCode()).subscribe({
      next: () => this.step.set('new-pin'),
      error: (err: Error) => this.auth.error.set(err.message),
    });
  }

  submitNewPin(): void {
    this.pinError.set('');
    if (this.newPin().length !== 4) {
      this.pinError.set('Le PIN doit contenir 4 chiffres.');
      return;
    }
    if (this.newPin() !== this.confirmPin()) {
      this.pinError.set('Les codes PIN ne correspondent pas.');
      return;
    }
    this.auth.setNewPin(this.newPin());
  }
}
