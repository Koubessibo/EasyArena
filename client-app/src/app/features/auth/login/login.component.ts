import { Component, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule, NgIf, PhoneInputComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private router = inject(Router);

  phone = signal('');
  errorMessage = signal('');

  onSubmit(): void {
    const phone = this.phone().trim();
    if (!phone) {
      this.errorMessage.set('Veuillez entrer votre numéro de téléphone.');
      return;
    }
    this.errorMessage.set('');
    this.router.navigate(['/pin-entry'], { queryParams: { phone } });
  }
}
