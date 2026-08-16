import { Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { AdminService, ContentItem, CreateOwnerData, CreateVendorData, EnrollmentRequestItem } from '../../../core/services/admin.service';
import { ApiService } from '../../../core/services/api.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, StatusBadgeComponent],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
})
export class UserManagementComponent {
  private adminService = inject(AdminService);
  public location = inject(Location);
  private api          = inject(ApiService);

  pendingUsers       = this.adminService.pendingUsers;
  allUsers           = this.adminService.allUsers;
  contentItems       = this.adminService.contentItems;
  enrollmentRequests = this.adminService.enrollmentRequests;

  // ── Tab state ────────────────────────────────────────────────────────────
  activeTab = signal<'pending' | 'active' | 'all' | 'requests'>('pending');

  // ── Create user form state ───────────────────────────────────────────────
  createSuccess = signal('');
  showCreateForm = signal(false);
  selectedRole = signal<'owner' | 'vendor'>('owner');
  acceptedCgu = signal(false);
  createLoading = signal(false);
  createError = signal('');


  // Owner fields
  ownerPhone = signal('');
  ownerFirstName = signal('');
  ownerLastName = signal('');
  ownerMobileMoney = signal('');

  // Vendor fields
  vendorPhone = signal('');
  vendorFirstName = signal('');
  vendorLastName = signal('');
  vendorShopName = signal('');
  vendorContactPhone = signal('');
  vendorLocation = signal('');

  constructor() {
    this.adminService.loadPendingUsers();
    this.adminService.loadContentModeration();
    this.adminService.loadEnrollmentRequests();
  }

  switchTab(tab: 'pending' | 'active' | 'all' | 'requests'): void {
    this.activeTab.set(tab);
    if (tab === 'pending') {
      this.adminService.loadPendingUsers();
    } else if (tab === 'requests') {
      this.adminService.loadEnrollmentRequests();
    } else {
      this.adminService.loadUsers(tab === 'all' ? undefined : tab);
    }
  }

  approve(id: string): void { this.adminService.approveUser(id); }
  reject(id: string): void  { this.adminService.rejectUser(id); }

  // ── Toggle Actif / Inactif ───────────────────────────────────────────────

  toggleUserStatus(user: { id: string; name: string; status: string }): void {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    this.adminService.updateUserStatus(user.id, newStatus).subscribe({
      next: () => {
        this.adminService.allUsers.update(list =>
          list.map(u => u.id === user.id ? { ...u, status: newStatus } : u)
        );
        this.createSuccess.set(
          `Compte ${user.name} ${newStatus === 'active' ? 'activé' : 'désactivé'} avec succès.`
        );
      },
      error: (err: Error) => alert(err.message),
    });
  }


  confirmDeleteUser(user: { id: string; name: string }): void {
    if (!confirm(`Supprimer le compte de ${user.name} ? Cette action est irréversible.`)) return;
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.adminService.allUsers.update(list => list.filter(u => u.id !== user.id));
      },
      error: (err: Error) => alert(err.message),
    });
  }

  roleLabel(role: string): string {
    return role === 'field_owner' ? 'Propriétaire' : 'Vendeur';
  }

  contentTypeLabel(type: string): string {
    return type === 'field' ? 'Terrain' : 'Article';
  }

  restoreContent(item: ContentItem): void {
    this.adminService.restoreContent(item.id, item.type);
  }

  openCreateForm(): void {
    this.showCreateForm.set(true);
    this.createError.set('');
    this.createSuccess.set('');
    this.resetFields();
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
    this.createError.set('');
  }

  setRole(role: 'owner' | 'vendor'): void {
    this.selectedRole.set(role);
    this.createError.set('');
  }

  submitCreate(): void {
    this.createError.set('');

    if (this.selectedRole() === 'owner') {
      if (!this.ownerPhone() || !this.ownerFirstName() || !this.ownerLastName()) {
        this.createError.set('Téléphone, prénom et nom sont obligatoires.');
        return;
      }
      const data: CreateOwnerData = {
        phone: this.ownerPhone(),
        first_name: this.ownerFirstName(),
        last_name: this.ownerLastName(),
        mobile_money: this.ownerMobileMoney() || undefined,
      };
      this.createLoading.set(true);
      this.adminService.createOwner(data).subscribe({
        next: () => {
          this.createLoading.set(false);
          this.showCreateForm.set(false);
          this.createSuccess.set('Compte propriétaire créé. PIN temporaire : 0000');
          this.adminService.loadPendingUsers();
        },
        error: (err: Error) => {
          this.createLoading.set(false);
          this.createError.set(err.message);
        },
      });
    } else {
      if (!this.vendorPhone() || !this.vendorFirstName() || !this.vendorLastName() || !this.vendorShopName() || !this.vendorContactPhone()) {
        this.createError.set('Téléphone, prénom, nom, boutique et téléphone contact sont obligatoires.');
        return;
      }
      const data: CreateVendorData = {
        phone: this.vendorPhone(),
        first_name: this.vendorFirstName(),
        last_name: this.vendorLastName(),
        shop_name: this.vendorShopName(),
        contact_phone: this.vendorContactPhone(),
        location: this.vendorLocation() || undefined,
      };
      this.createLoading.set(true);
      this.adminService.createVendor(data).subscribe({
        next: () => {
          this.createLoading.set(false);
          this.showCreateForm.set(false);
          this.createSuccess.set('Compte vendeur créé. PIN temporaire : 0000');
          this.adminService.loadPendingUsers();
        },
        error: (err: Error) => {
          this.createLoading.set(false);
          this.createError.set(err.message);
        },
      });
    }
  }

  approveEnrollment(item: EnrollmentRequestItem): void {
    this.adminService.approveEnrollmentRequest(item.id).subscribe({
      next: () => {
        this.adminService.enrollmentRequests.update(list => list.filter(r => r.id !== item.id));
        this.createSuccess.set(`Compte ${item.role === 'owner' ? 'propriétaire' : 'vendeur'} créé pour ${item.name}. PIN temporaire : 0000`);
      },
      error: (err: Error) => alert(err.message),
    });
  }

  rejectEnrollment(item: EnrollmentRequestItem): void {
    const note = prompt(`Motif de rejet pour ${item.name} (optionnel) :`);
    if (note === null) return; // cancelled
    this.adminService.rejectEnrollmentRequest(item.id, note || undefined).subscribe({
      next: () => this.adminService.enrollmentRequests.update(list => list.filter(r => r.id !== item.id)),
      error: (err: Error) => alert(err.message),
    });
  }

  enrollmentRoleLabel(role: 'owner' | 'vendor'): string {
    return role === 'owner' ? 'Propriétaire' : 'Vendeur';
  }

  // ── Ambassadeur Toggle ────────────────────────────────────────────────────
  toggleAmbassador(user: { id: string; name: string; is_ambassador?: boolean }): void {
    const newStatus = !user.is_ambassador;
    const action = newStatus ? 'Promouvoir Ambassadeur' : 'Rétrograder Client';
    if (!confirm(`${action} : ${user.name} ?`)) return;

    this.api.patch<unknown>(`/sponsorship/users/${user.id}/ambassador-status`, {
      is_ambassador: newStatus,
    }).subscribe({
      next: () => {
        this.adminService.allUsers.update(list =>
          list.map(u => u.id === user.id ? { ...u, is_ambassador: newStatus } : u)
        );
        this.createSuccess.set(`${user.name} ${newStatus ? 'promu Ambassadeur' : 'rétrogradé Client'}`);
      },
      error: (err: Error) => alert(err.message),
    });
  }

  private resetFields(): void {
    this.ownerPhone.set(''); this.ownerFirstName.set(''); this.ownerLastName.set(''); this.ownerMobileMoney.set('');
    this.vendorPhone.set(''); this.vendorFirstName.set(''); this.vendorLastName.set('');
    this.vendorShopName.set(''); this.vendorContactPhone.set(''); this.vendorLocation.set('');
  }
}
