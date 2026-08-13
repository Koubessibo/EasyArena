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

  phone = signal('');
  loading = signal(false);
  errorMessage = signal('');
  successState = signal(false);

  goBack(): void {
    this.router.navigate(['/login']);
  }

  onSubmit(): void {
    const phoneValue = this.phone().trim();
    if (!phoneValue) {
      this.errorMessage.set('Veuillez entrer votre numéro de téléphone.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.requestPasswordReset(phoneValue).subscribe({
      next: () => {
        this.successState.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Une erreur est survenue. Veuillez réessayer.');
        this.loading.set(false);
      },
    });
  }

  verifyCode(): void {
    this.router.navigate(['/otp-verify'], {
      queryParams: { phone: this.phone(), mode: 'reset' },
    });
  }
}
