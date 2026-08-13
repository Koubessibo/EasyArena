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

  step = signal<'credentials' | 'forgot-phone' | 'otp' | 'new-pin'>('credentials');
  otpCode = signal('');
  newPin = signal('');
  confirmPin = signal('');
  pinError = signal('');
  forgotPhone = signal('');

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

  submitOtp(): void {
    if (this.otpCode().length < 6) return;
    this.auth.verifyOtpForPinChange(this.otpCode()).subscribe({
      next: () => this.step.set('new-pin'),
      error: (err: Error) => this.auth.error.set(err.message),
    });
  }

  submitForgotPin(): void {
    if (!this.forgotPhone()) return;
    this.auth.error.set(null);
    this.auth.forgotPin(this.forgotPhone()).subscribe({
      next: () => this.step.set('otp'),
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
