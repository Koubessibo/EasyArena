import { Component, signal, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-pin-entry',
  standalone: true,
  imports: [NgIf, NgFor, RouterLink],
  templateUrl: './pin-entry.component.html',
  styleUrl: './pin-entry.component.scss',
})
export class PinEntryComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  phone = signal('');
  pinDigits = signal<string[]>(['', '', '', '']);
  loading = signal(false);
  shake = signal(false);
  errorMessage = signal('');

  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  ngOnInit(): void {
    const phone = this.route.snapshot.queryParamMap.get('phone') ?? '';
    this.phone.set(phone);
    if (!phone) {
      this.router.navigate(['/login']);
    }
  }

  get filledCount(): number {
    return this.pinDigits().filter(d => d !== '').length;
  }

  pressKey(key: string): void {
    if (this.loading()) return;

    if (key === 'back') {
      this.deleteDigit();
    } else if (key !== '') {
      this.addDigit(key);
    }
  }

  private addDigit(digit: string): void {
    const digits = [...this.pinDigits()];
    const emptyIndex = digits.findIndex(d => d === '');
    if (emptyIndex === -1) return;

    digits[emptyIndex] = digit;
    this.pinDigits.set(digits);

    if (digits.every(d => d !== '')) {
      setTimeout(() => this.validatePin(), 200);
    }
  }

  private deleteDigit(): void {
    const digits = [...this.pinDigits()];
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] !== '') {
        digits[i] = '';
        break;
      }
    }
    this.pinDigits.set(digits);
    this.errorMessage.set('');
  }

  private validatePin(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    const pin = this.pinDigits().join('');
    this.authService.login(this.phone(), pin).subscribe({
      error: (err: Error) => {
        this.loading.set(false);
        this.pinDigits.set(['', '', '', '']);
        this.errorMessage.set(err.message || 'PIN incorrect. Veuillez réessayer.');
        this.triggerShake();
      },
    });
  }

  private triggerShake(): void {
    this.shake.set(true);
    setTimeout(() => this.shake.set(false), 500);
  }

  switchAccount(): void {
    this.router.navigate(['/login']);
  }
}
