import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

const OTP_LENGTH = 6;

@Component({
  selector: 'app-otp-verify',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './otp-verify.component.html',
  styleUrl: './otp-verify.component.scss',
})
export class OtpVerifyComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  phone = signal('');
  otpDigits = signal<string[]>(Array(OTP_LENGTH).fill(''));
  loading = signal(false);
  resending = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  countdown = signal(59);
  canResend = signal(false);

  private countdownInterval?: ReturnType<typeof setInterval>;

  readonly trackByIdx = (i: number) => i;

  ngOnInit(): void {
    const phone = this.route.snapshot.queryParamMap.get('phone')
      || this.authService.pendingPhone()
      || '';
    this.phone.set(phone);
    this.authService.pendingPhone.set(phone);
    this.startCountdown();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  private startCountdown(): void {
    this.countdown.set(59);
    this.canResend.set(false);

    this.countdownInterval = setInterval(() => {
      this.countdown.update(v => {
        if (v <= 1) {
          clearInterval(this.countdownInterval);
          this.canResend.set(true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  get formattedCountdown(): string {
    return `00:${String(this.countdown()).padStart(2, '0')}`;
  }

  get otpValue(): string {
    return this.otpDigits().join('');
  }

  onDigitKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const input = event.target as HTMLInputElement;
      const digits = [...this.otpDigits()];
      if (digits[index]) {
        digits[index] = '';
        input.value = '';
        this.otpDigits.set(digits);
      } else if (index > 0) {
        digits[index - 1] = '';
        this.otpDigits.set(digits);
        const prev = document.getElementById(`otp-${index - 1}`) as HTMLInputElement;
        if (prev) { prev.value = ''; prev.focus(); }
      }
    }
  }

  onDigitInput(event: Event, index: number): void {
    // Skip intermediate Android IME composition events.
    if ((event as InputEvent).isComposing) return;

    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    input.value = digit;
    const digits = [...this.otpDigits()];
    digits[index] = digit;
    this.otpDigits.set(digits);
    this.errorMessage.set('');

    if (digit && index < OTP_LENGTH - 1) {
      // Defer focus so Android IME fully commits the character to the current
      // box before focus moves — prevents the character from leaking into the
      // next box and causing every digit to fill two consecutive inputs.
      setTimeout(() => {
        (document.getElementById(`otp-${index + 1}`) as HTMLInputElement)?.focus();
      });
    }
    if (this.otpValue.length === OTP_LENGTH) this.verify();
  }

  onDigitPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    const digits = pasted.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');

    const newDigits = Array(OTP_LENGTH).fill('');
    digits.forEach((d, i) => { newDigits[i] = d; });
    this.otpDigits.set(newDigits);

    if (digits.length === OTP_LENGTH) {
      this.verify();
    }
  }

  verify(): void {
    if (this.otpValue.length !== OTP_LENGTH) {
      this.errorMessage.set(`Veuillez entrer les ${OTP_LENGTH} chiffres du code OTP.`);
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.verifyOtp(this.otpValue).subscribe({
      error: (err: Error) => {
        this.errorMessage.set(err.message || 'Code OTP incorrect. Veuillez réessayer.');
        this.loading.set(false);
        this.otpDigits.set(Array(OTP_LENGTH).fill(''));
        document.getElementById('otp-0')?.focus();
      },
      complete: () => {
        this.loading.set(false);
      },
    });
  }

  resendCode(): void {
    if (!this.canResend()) return;

    this.resending.set(true);
    this.errorMessage.set('');

    this.authService.resendOtp().subscribe({
      next: () => {
        this.successMessage.set('Code envoyé avec succès !');
        this.resending.set(false);
        this.startCountdown();
        setTimeout(() => this.successMessage.set(''), 3000);
      },
      error: () => {
        this.resending.set(false);
      },
    });
  }
}
