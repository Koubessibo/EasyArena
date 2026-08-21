import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, ContentItem, CreateOwnerData, CreateVendorData, EnrollmentRequestItem } from '../../../core/services/admin.service';
import { ApiService } from '../../../core/services/api.service';
import { DashboardUser } from '../../../core/models/auth.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
})
export class UserManagementComponent {
  private adminService = inject(AdminService);
  public location = inject(Location);
  private api = inject(ApiService);

  pendingUsers = this.adminService.pendingUsers;
  allUsers = this.adminService.allUsers;
  contentItems = this.adminService.contentItems;
  enrollmentRequests = this.adminService.enrollmentRequests;

  // ── Tab & Search filter state ─────────────────────────────────────────────
  activeTab = signal<'pending' | 'active' | 'all' | 'requests'>('pending');
  searchQuery = signal('');
  roleFilter = signal<string>('all');

  // KPI Statistics
  totalUsersCount = computed(() => this.allUsers().length);
  clientUsersCount = computed(() => this.allUsers().filter(u => u.role === 'client').length);
  ownerUsersCount = computed(() => this.allUsers().filter(u => u.role === 'field_owner' || (u.role as string) === 'owner').length);
  vendorUsersCount = computed(() => this.allUsers().filter(u => u.role === 'vendor').length);
  vipUsersCount = computed(() => this.allUsers().filter(u => u.custom_n1_rate || u.custom_n2_rate || u.custom_duration_months || u.is_ambassador).length);

  // Filtered Users List
  filteredUsers = computed(() => {
    const list = this.allUsers();
    const query = this.searchQuery().toLowerCase().trim();
    const role = this.roleFilter();

    return list.filter(u => {
      const matchesSearch = !query ||
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.phone && u.phone.includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query));

      const matchesRole = role === 'all' ||
        (role === 'vip' ? (u.custom_n1_rate || u.custom_n2_rate || u.custom_duration_months || u.is_ambassador) : u.role === role);

      return matchesSearch && matchesRole;
    });
  });

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

  // ── VIP Sponsorship Modal State ──────────────────────────────────────────
  selectedUserForVip = signal<DashboardUser | null>(null);
  vipN1 = signal<number | null>(null);
  vipN2 = signal<number | null>(null);
  vipDuration = signal<number | null>(null);
  vipLoading = signal(false);
  vipSuccessMessage = signal<string | null>(null);
  vipErrorMessage = signal<string | null>(null);

  constructor() {
    this.adminService.loadPendingUsers();
    this.adminService.loadContentModeration();
    this.adminService.loadEnrollmentRequests();
    this.adminService.loadUsers(); // Load all users by default for KPI counters
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
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Super Admin',
      field_owner: 'Propriétaire',
      owner: 'Propriétaire',
      vendor: 'Vendeur',
      client: 'Client',
      field_admin: 'Admin Terrain',
      controller: 'Contrôleur',
    };
    return labels[role] ?? role;
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
    if (note === null) return;
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

  // ── GESTION DES PARAMÈTRES PARRAINAGE VIP ──────────────────────────────
  openVipModal(user: DashboardUser): void {
    this.selectedUserForVip.set(user);
    this.vipN1.set(user.custom_n1_rate ?? null);
    this.vipN2.set(user.custom_n2_rate ?? null);
    this.vipDuration.set(user.custom_duration_months ?? null);
    this.vipSuccessMessage.set(null);
    this.vipErrorMessage.set(null);
  }

  closeVipModal(): void {
    this.selectedUserForVip.set(null);
    this.vipSuccessMessage.set(null);
    this.vipErrorMessage.set(null);
  }

  saveVipSettings(): void {
    const user = this.selectedUserForVip();
    if (!user) return;

    this.vipLoading.set(true);
    this.vipErrorMessage.set(null);
    this.vipSuccessMessage.set(null);

    const valN1 = this.vipN1();
    const valN2 = this.vipN2();
    const valDur = this.vipDuration();

    const payload = {
      custom_n1_rate: valN1 !== null && valN1 !== undefined && (valN1 as any) !== '' ? Number(valN1) : null,
      custom_n2_rate: valN2 !== null && valN2 !== undefined && (valN2 as any) !== '' ? Number(valN2) : null,
      custom_duration_months: valDur !== null && valDur !== undefined && (valDur as any) !== '' ? Number(valDur) : null,
    };

    this.adminService.updateUserSponsorshipSettings(user.id, payload).subscribe({
      next: (res) => {
        this.vipLoading.set(false);
        this.vipSuccessMessage.set(res?.message || 'Privilèges VIP enregistrés avec succès !');

        this.adminService.allUsers.update(list =>
          list.map(u => u.id === user.id ? {
            ...u,
            custom_n1_rate: payload.custom_n1_rate,
            custom_n2_rate: payload.custom_n2_rate,
            custom_duration_months: payload.custom_duration_months,
          } : u)
        );

        setTimeout(() => this.closeVipModal(), 1500);
      },
      error: (err: Error) => {
        this.vipLoading.set(false);
        this.vipErrorMessage.set(err.message || 'Erreur lors de l\'enregistrement des privilèges VIP.');
      },
    });
  }

  resetVipSettings(): void {
    const user = this.selectedUserForVip();
    if (!user) return;

    this.vipLoading.set(true);
    this.vipErrorMessage.set(null);
    this.vipSuccessMessage.set(null);

    const payload = {
      custom_n1_rate: null,
      custom_n2_rate: null,
      custom_duration_months: null,
    };

    this.adminService.updateUserSponsorshipSettings(user.id, payload).subscribe({
      next: () => {
        this.vipLoading.set(false);
        this.vipN1.set(null);
        this.vipN2.set(null);
        this.vipDuration.set(null);
        this.vipSuccessMessage.set('Taux réinitialisés aux valeurs par défaut !');

        this.adminService.allUsers.update(list =>
          list.map(u => u.id === user.id ? {
            ...u,
            custom_n1_rate: null,
            custom_n2_rate: null,
            custom_duration_months: null,
          } : u)
        );

        setTimeout(() => this.closeVipModal(), 1500);
      },
      error: (err: Error) => {
        this.vipLoading.set(false);
        this.vipErrorMessage.set(err.message || 'Erreur lors de la réinitialisation.');
      },
    });
  }

  private resetFields(): void {
    this.ownerPhone.set(''); this.ownerFirstName.set(''); this.ownerLastName.set(''); this.ownerMobileMoney.set('');
    this.vendorPhone.set(''); this.vendorFirstName.set(''); this.vendorLastName.set('');
    this.vendorShopName.set(''); this.vendorContactPhone.set(''); this.vendorLocation.set('');
  }
}
