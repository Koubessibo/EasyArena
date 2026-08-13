import { Component, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

type RegisterStep = 'role-select' | 'customer' | 'owner' | 'vendor' | 'success';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, FormsModule, NgIf, PhoneInputComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private authService = inject(AuthService);

  step = signal<RegisterStep>('role-select');

  // common fields
  firstName = signal('');
  lastName = signal('');
  phone = signal('');
  acceptedCgu = signal(false);
  errorMessage = signal('');

  // owner-specific
  fieldName = signal('');
  mobileMoney = signal('');

  // vendor-specific
  shopName = signal('');
  contactPhone = signal('');
  location = signal('');

  // CGU Modal state
  showCguModal = signal(false);
  cguTab = signal<'client' | 'owner' | 'vendor'>('client');

  get loading() {
    return this.authService.loading;
  }

  selectRole(role: 'customer' | 'owner' | 'vendor'): void {
    this.step.set(role);
    this.errorMessage.set('');
    if (role === 'customer') this.cguTab.set('client');
    else if (role === 'owner') this.cguTab.set('owner');
    else if (role === 'vendor') this.cguTab.set('vendor');
  }

  openCguModal(tab?: 'client' | 'owner' | 'vendor'): void {
    if (tab) this.cguTab.set(tab);
    this.showCguModal.set(true);
  }

  closeCguModal(): void {
    this.showCguModal.set(false);
  }

  acceptCguFromModal(): void {
    this.acceptedCgu.set(true);
    this.showCguModal.set(false);
  }

  goBack(): void {
    this.step.set('role-select');
    this.errorMessage.set('');
  }

  onSubmitCustomer(): void {
    const firstName = this.firstName().trim();
    const lastName = this.lastName().trim();
    const phone = this.phone().trim();

    if (!firstName || !lastName || !phone) {
      this.errorMessage.set('Veuillez remplir tous les champs.');
      return;
    }

    this.errorMessage.set('');
    this.authService.register({ firstName, lastName, phone }).subscribe({
      error: (err: Error) => this.errorMessage.set(err.message),
    });
  }

  onSubmitOwner(): void {
    const firstName = this.firstName().trim();
    const lastName = this.lastName().trim();
    const phone = this.phone().trim();
    const fieldName = this.fieldName().trim();

    if (!firstName || !lastName || !phone || !fieldName) {
      this.errorMessage.set('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    this.errorMessage.set('');
    this.authService.submitEnrollmentRequest({
      first_name: firstName,
      last_name: lastName,
      phone,
      role: 'owner',
      field_name: fieldName,
      mobile_money: this.mobileMoney().trim() || undefined,
    }).subscribe({
      next: () => this.step.set('success'),
      error: (err: Error) => this.errorMessage.set(err.message),
    });
  }

  onSubmitVendor(): void {
    const firstName = this.firstName().trim();
    const lastName = this.lastName().trim();
    const phone = this.phone().trim();
    const shopName = this.shopName().trim();
    const contactPhone = this.contactPhone().trim();

    if (!firstName || !lastName || !phone || !shopName || !contactPhone) {
      this.errorMessage.set('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    this.errorMessage.set('');
    this.authService.submitEnrollmentRequest({
      first_name: firstName,
      last_name: lastName,
      phone,
      role: 'vendor',
      shop_name: shopName,
      contact_phone: contactPhone,
      location: this.location().trim() || undefined,
    }).subscribe({
      next: () => this.step.set('success'),
      error: (err: Error) => this.errorMessage.set(err.message),
    });
  }
}
