import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

type PinStep = 'create' | 'confirm';

@Component({
  selector: 'app-pin-setup',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './pin-setup.component.html',
  styleUrl: './pin-setup.component.scss',
})
export class PinSetupComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  step = signal<PinStep>('create');
  pinDigits = signal<string[]>(['', '', '', '']);
  confirmDigits = signal<string[]>(['', '', '', '']);
  loading = signal(false);
  errorMessage = signal('');
  success = signal(false);

  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  get currentDigits(): string[] {
    return this.step() === 'create' ? this.pinDigits() : this.confirmDigits();
  }

  get currentPin(): string {
    return this.currentDigits.join('');
  }

  get filledCount(): number {
    return this.currentDigits.filter(d => d !== '').length;
  }

  goBack(): void {
    if (this.step() === 'confirm') {
      this.step.set('create');
      this.confirmDigits.set(['', '', '', '']);
      this.errorMessage.set('');
    } else {
      this.router.navigate(['/otp-verify']);
    }
  }

  pressKey(key: string): void {
    if (this.loading() || this.success()) return;

    if (key === 'back') {
      this.deleteDigit();
    } else if (key !== '') {
      this.addDigit(key);
    }
  }

  private addDigit(digit: string): void {
    const digits = this.step() === 'create' ? [...this.pinDigits()] : [...this.confirmDigits()];
    const emptyIndex = digits.findIndex(d => d === '');
    if (emptyIndex === -1) return;

    digits[emptyIndex] = digit;

    if (this.step() === 'create') {
      this.pinDigits.set(digits);
      if (digits.every(d => d !== '')) {
        setTimeout(() => this.step.set('confirm'), 300);
      }
    } else {
      this.confirmDigits.set(digits);
      if (digits.every(d => d !== '')) {
        setTimeout(() => this.validatePin(), 300);
      }
    }
  }

  private deleteDigit(): void {
    const digits = this.step() === 'create' ? [...this.pinDigits()] : [...this.confirmDigits()];
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] !== '') {
        digits[i] = '';
        break;
      }
    }
    if (this.step() === 'create') {
      this.pinDigits.set(digits);
    } else {
      this.confirmDigits.set(digits);
    }
    this.errorMessage.set('');
  }

  private validatePin(): void {
    const pin = this.pinDigits().join('');
    const confirm = this.confirmDigits().join('');

    if (pin !== confirm) {
      this.errorMessage.set('Les PINs ne correspondent pas');
      this.confirmDigits.set(['', '', '', '']);
      this.pinDigits.set(['', '', '', '']);
      this.step.set('create');
      return;
    }

    this.loading.set(true);
    this.authService.setupPin(pin).subscribe({
      error: (err: Error) => {
        this.loading.set(false);
        this.errorMessage.set(err.message || 'Une erreur est survenue. Veuillez réessayer.');
        this.confirmDigits.set(['', '', '', '']);
        this.step.set('confirm');
      },
    });
  }
}
