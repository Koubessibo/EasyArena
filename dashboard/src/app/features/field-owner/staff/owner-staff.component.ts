import { Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../core/services/field-owner.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  createdAt: string;
  can_withdraw: boolean;
}

@Component({
  selector: 'app-owner-staff',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, PhoneInputComponent],
  templateUrl: './owner-staff.component.html',
  styleUrl: './owner-staff.component.scss',
})
export class OwnerStaffComponent {
  private svc = inject(FieldOwnerService);
  public location = inject(Location);

  staffList = signal<StaffMember[]>([]);
  loading = signal(true);
  feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  showForm = signal(false);
  formFirstName = signal('');
  formLastName = signal('');
  formPhone = signal('');
  formRole = signal<'field_admin' | 'controller'>('field_admin');
  submitting = signal(false);
  formError = signal('');

  // Delete state
  deleting = signal<string | null>(null);

  constructor() {
    this.loadStaff();
  }

  loadStaff(): void {
    this.svc.listStaff().subscribe({
      next: (list) => {
        this.staffList.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = { field_admin: 'Administrateur Terrain', controller: 'Contrôleur' };
    return map[role] ?? role;
  }

  toggleForm(): void {
    this.showForm.set(!this.showForm());
    this.formFirstName.set('');
    this.formLastName.set('');
    this.formPhone.set('');
    this.formRole.set('field_admin');
    this.formError.set('');
  }

  addStaff(): void {
    const firstName = this.formFirstName().trim();
    const lastName = this.formLastName().trim();
    const phone = this.formPhone().trim();

    if (!firstName || !lastName || !phone) {
      this.formError.set('Veuillez remplir tous les champs.');
      return;
    }

    this.formError.set('');
    this.submitting.set(true);

    this.svc.createStaff({ first_name: firstName, last_name: lastName, phone, role: this.formRole() }).subscribe({
      next: (res) => {
        this.staffList.update(list => [{
          id: res.user?.id ?? '',
          firstName: res.user?.first_name ?? firstName,
          lastName: res.user?.last_name ?? lastName,
          phone: res.user?.phone ?? phone,
          role: res.user?.role ?? this.formRole(),
          createdAt: res.user?.created_at ?? new Date().toISOString(),
          can_withdraw: false,
        }, ...list]);
        this.showForm.set(false);
        this.submitting.set(false);
        this.feedback.set({ type: 'success', message: 'Collaborateur ajouté avec succès. PIN temporaire : 0000' });
        setTimeout(() => this.feedback.set(null), 5000);
      },
      error: (err: any) => {
        this.formError.set(err?.error?.message ?? 'Erreur lors de l\'ajout.');
        this.submitting.set(false);
      },
    });
  }

  toggleCanWithdraw(staff: StaffMember): void {
    const newValue = !staff.can_withdraw;
    this.svc.updateStaffCanWithdraw(staff.id, newValue).subscribe({
      next: () => {
        this.staffList.update(list => list.map(s => s.id === staff.id ? { ...s, can_withdraw: newValue } : s));
        this.feedback.set({ type: 'success', message: newValue ? 'Retraits autorisés pour ce collaborateur.' : 'Retraits désactivés pour ce collaborateur.' });
        setTimeout(() => this.feedback.set(null), 4000);
      },
      error: (err: any) => {
        this.feedback.set({ type: 'error', message: err?.error?.message ?? 'Erreur lors de la mise à jour.' });
      },
    });
  }

  deleteStaff(staffId: string): void {
    if (!confirm('Supprimer ce collaborateur ?')) return;
    this.deleting.set(staffId);
    this.svc.deleteStaff(staffId).subscribe({
      next: () => {
        this.staffList.update(list => list.filter(s => s.id !== staffId));
        this.deleting.set(null);
        this.feedback.set({ type: 'success', message: 'Collaborateur supprimé.' });
        setTimeout(() => this.feedback.set(null), 4000);
      },
      error: (err: any) => {
        this.deleting.set(null);
        this.feedback.set({ type: 'error', message: err?.error?.message ?? 'Erreur lors de la suppression.' });
      },
    });
  }
}
