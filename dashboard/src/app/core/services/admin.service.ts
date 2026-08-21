import { Injectable, signal, inject } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { PlatformStats, Transaction, AdminWithdrawalRequest } from '../models/transaction.model';
import { DashboardUser, UserRole } from '../models/auth.model';
import { ApiService } from './api.service';

export interface EnrollmentRequestItem {
  id: string;
  name: string;
  phone: string;
  role: 'owner' | 'vendor';
  detail?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ContentItem {
  id: string;
  type: 'field' | 'article';
  title: string;
  ownerName: string;
  status: string;
}

export interface CreateOwnerData {
  phone: string;
  first_name: string;
  last_name: string;
  mobile_money?: string;
}

export interface CreateVendorData {
  phone: string;
  first_name: string;
  last_name: string;
  shop_name: string;
  contact_phone: string;
  location?: string;
}

export interface SponsorshipWithdrawalItem {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  amount: number;
  phone: string;
  operator: string;
  status: 'PENDING' | 'PROCESSED' | 'REJECTED';
  rejectionNote?: string;
  createdAt: string;
}

export interface PlatformTreasuryBalance {
  success: boolean;
  total_gross_revenue: number;
  total_withdrawn: number;
  treasury_balance: number;
  fee_rate: string;
  currency: string;
}

export interface PlatformWithdrawalItem {
  id: string;
  amount: number;
  method: 'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY' | 'SAMIR_MONEY';
  account_details: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  created_at: string;
}

const ROLE_MAP: Record<string, UserRole> = {
  admin: 'super_admin',
  owner: 'field_owner',
  vendor: 'vendor',
  client: 'client',
  field_admin: 'field_admin',
  controller: 'controller',
};

function mapStats(s: any): PlatformStats {
  const totalUsers = Object.values(s.total_users ?? {}).reduce((a: number, b) => a + Number(b), 0);
  const totalBookings = Object.values(s.total_bookings ?? {}).reduce((a: number, b) => a + Number(b), 0);
  return {
    totalUsers,
    totalBookings,
    totalRevenue: Number(s.total_revenue ?? 0), // EasyArena commission (service fees from confirmed bookings)
    activeNow: 0,
    newUsersToday: 0,
    bookingsToday: Number((s.total_bookings as any)?.confirmed ?? 0),
    revenueToday: 0,
  };
}

function mapUser(u: any): DashboardUser {
  return {
    id: u.id,
    name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
    email: u.email ?? '',
    phone: u.phone ?? '',
    role: ROLE_MAP[u.role] ?? 'vendor',
    status: u.status ?? '',
    isVerified: u.status === 'active',
    createdAt: u.created_at ?? '',
    is_ambassador: u.is_ambassador !== false,
    custom_n1_rate: u.custom_n1_rate ?? null,
    custom_n2_rate: u.custom_n2_rate ?? null,
    custom_duration_months: u.custom_duration_months ?? null,
  };
}

function mapWithdrawal(w: any): AdminWithdrawalRequest {
  const userName = w.owner?.user
    ? `${w.owner.user.first_name ?? ''} ${w.owner.user.last_name ?? ''}`.trim()
    : 'Inconnu';
  const rawStatus: string = w.status ?? 'pending_validation';
  const statusMap: Record<string, AdminWithdrawalRequest['status']> = {
    pending_validation: 'pending',
    approved: 'approved',
    rejected: 'rejected',
    processed: 'completed',
  };
  return {
    id: w.id,
    userId: w.owner_id ?? '',
    userName,
    amount: Number(w.amount ?? 0),
    method: w.method ?? 'mobile_money',
    destination: w.destination ?? '',
    operator: w.operator ?? null,
    status: statusMap[rawStatus] ?? 'pending',
    rejectionNote: w.rejection_note,
    ribUrl: w.rib_url,
    requestedAt: w.requested_at ?? w.created_at ?? '',
    processedAt: w.processed_at,
  };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly stats = signal<PlatformStats>({
    totalUsers: 0,
    totalBookings: 0,
    totalRevenue: 0,
    activeNow: 0,
    newUsersToday: 0,
    bookingsToday: 0,
    revenueToday: 0,
  });

  readonly pendingUsers = signal<DashboardUser[]>([]);
  readonly allUsers = signal<DashboardUser[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly withdrawalRequests = signal<AdminWithdrawalRequest[]>([]);
  readonly sponsorshipWithdrawals = signal<SponsorshipWithdrawalItem[]>([]);

  readonly monthlyRevenue = signal<{ month: string; value: number }[]>([]);
  readonly contentItems = signal<ContentItem[]>([]);
  readonly enrollmentRequests = signal<EnrollmentRequestItem[]>([]);

  readonly treasuryBalance = signal<PlatformTreasuryBalance | null>(null);
  readonly platformWithdrawals = signal<PlatformWithdrawalItem[]>([]);

  loadTreasuryBalance(): void {
    this.api.get<PlatformTreasuryBalance>('/admin/treasury/balance').subscribe({
      next: (res) => this.treasuryBalance.set(res),
      error: (err: any) => console.error('Failed to load treasury balance', err),
    });
  }

  loadPlatformWithdrawals(): void {
    this.api.get<{ success: boolean; withdrawals: PlatformWithdrawalItem[] }>('/admin/treasury/withdrawals').subscribe({
      next: (res) => this.platformWithdrawals.set(res.withdrawals ?? []),
      error: (err: any) => console.error('Failed to load platform withdrawals', err),
    });
  }

  withdrawPlatformTreasury(amount: number, method: 'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY' | 'SAMIR_MONEY', accountDetails: string): Observable<any> {
    return this.api.post('/admin/treasury/withdraw', {
      amount,
      method,
      accountDetails,
    });
  }

  loadMonthlyRevenue(): void {
    this.api.get<{ month: string; value: number }[]>('/admin/stats/monthly-revenue').subscribe({
      next: (data) => this.monthlyRevenue.set(data),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadContentModeration(): void {
    forkJoin([
      this.api.get<any>('/admin/fields?status=inactive&per_page=10'),
      this.api.get<any>('/admin/articles?status=hidden&per_page=10'),
    ]).subscribe({
      next: ([fieldsRes, articlesRes]) => {
        const fields: ContentItem[] = (fieldsRes.data ?? []).map((f: any) => ({
          id: f.id,
          type: 'field' as const,
          title: f.name,
          ownerName: f.owner?.user ? `${f.owner.user.first_name ?? ''} ${f.owner.user.last_name ?? ''}`.trim() : 'Inconnu',
          status: f.status,
        }));
        const articles: ContentItem[] = (articlesRes.data ?? []).map((a: any) => ({
          id: a.id,
          type: 'article' as const,
          title: a.name,
          ownerName: a.vendor?.user ? `${a.vendor.user.first_name ?? ''} ${a.vendor.user.last_name ?? ''}`.trim() : 'Inconnu',
          status: a.status,
        }));
        this.contentItems.set([...fields, ...articles]);
      },
      error: (err: Error) => this.error.set(err.message),
    });
  }

  restoreContent(id: string, type: 'field' | 'article'): void {
    const url = type === 'field'
      ? `/admin/fields/${id}/status`
      : `/admin/articles/${id}/status`;
    const body = type === 'field' ? { status: 'available' } : { status: 'in_stock' };
    this.api.put<any>(url, body).subscribe({
      next: () => this.contentItems.update(list => list.filter(c => c.id !== id)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  createOwner(data: CreateOwnerData) {
    return this.api.post<any>('/admin/users/owner', data);
  }

  createVendor(data: CreateVendorData) {
    return this.api.post<any>('/admin/users/vendor', data);
  }

  loadStats(period = 'all_time'): void {
    this.api.get<any>(`/admin/stats?period=${period}`).subscribe({
      next: (s) => this.stats.set(mapStats(s)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadPendingUsers(): void {
    this.api.get<any>('/admin/users?status=pending&per_page=50').subscribe({
      next: (res) => this.pendingUsers.set((res.data ?? []).map(mapUser)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadUsers(status?: 'pending' | 'active' | 'suspended'): void {
    const params = status ? `?status=${status}&per_page=100` : '?per_page=100';
    this.api.get<any>(`/admin/users${params}`).subscribe({
      next: (res) => this.allUsers.set((res.data ?? []).map(mapUser)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  deleteUser(id: string) {
    return this.api.delete<any>(`/admin/users/${id}`);
  }

  updateUserStatus(id: string, status: 'active' | 'inactive' | 'suspended') {
    return this.api.put<any>(`/admin/users/${id}/status`, { status });
  }

  loadTransactions(): void {
    this.api.get<any>('/admin/bookings?per_page=20').subscribe({
      next: (res) => {
        const txList: Transaction[] = (res.data ?? []).map((b: any) => ({
          id: b.id,
          type: 'booking_payment' as const,
          description: `Réservation – ${b.field?.name ?? ''}`,
          amount: Number(b.total_amount ?? 0),
          status: 'completed' as const,
          createdAt: b.created_at ?? '',
        }));
        this.transactions.set(txList);
      },
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadWithdrawals(): void {
    this.api.get<any>('/admin/withdrawals?per_page=50').subscribe({
      next: (res) => this.withdrawalRequests.set((res.data ?? []).map(mapWithdrawal)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadSponsorshipWithdrawals(): void {
    this.api.get<any[]>('/admin/sponsorship-withdrawals').subscribe({
      next: (res) => {
        const list: SponsorshipWithdrawalItem[] = (Array.isArray(res) ? res : []).map((item: any) => ({
          id: item.id,
          userId: item.user_id,
          userName: item.user ? `${item.user.first_name ?? ''} ${item.user.last_name ?? ''}`.trim() || 'Ambassadeur' : 'Ambassadeur',
          userPhone: item.user?.phone ?? item.phone ?? '',
          amount: Number(item.amount ?? 0),
          phone: item.phone,
          operator: item.operator,
          status: item.status,
          rejectionNote: item.rejection_note,
          createdAt: item.created_at,
        }));
        this.sponsorshipWithdrawals.set(list);
      },
      error: (err: Error) => this.error.set(err.message),
    });
  }

  processSponsorshipWithdrawal(id: string, action: 'APPROVE' | 'REJECT', rejectionNote?: string): Observable<any> {
    if (action === 'APPROVE') {
      return this.api.put<any>(`/admin/sponsorship-withdrawals/${id}/validate`, {});
    } else {
      return this.api.put<any>(`/admin/sponsorship-withdrawals/${id}/reject`, { rejection_note: rejectionNote });
    }
  }

  approveUser(userId: string): void {
    this.api.put<any>(`/admin/users/${userId}/status`, { status: 'active' }).subscribe({
      next: () => this.pendingUsers.update(list => list.filter(u => u.id !== userId)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  rejectUser(userId: string): void {
    this.api.put<any>(`/admin/users/${userId}/status`, { status: 'suspended' }).subscribe({
      next: () => this.pendingUsers.update(list => list.filter(u => u.id !== userId)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  processWithdrawal(id: string, action: 'approved' | 'rejected') {
    const apiAction = action === 'approved' ? 'approve' : 'reject';
    return this.api.put<any>(`/admin/withdrawals/${id}/validate`, { action: apiAction });
  }

  loadEnrollmentRequests(status = 'pending'): void {
    this.api.get<any[]>(`/admin/enrollment-requests?status=${status}`).subscribe({
      next: (data) => this.enrollmentRequests.set(
        (Array.isArray(data) ? data : []).map((r: any): EnrollmentRequestItem => ({
          id: r.id,
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
          phone: r.phone ?? '',
          role: r.role,
          detail: r.field_name ?? r.shop_name ?? '',
          status: r.status,
          createdAt: r.created_at ?? '',
        }))
      ),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  approveEnrollmentRequest(id: string): Observable<any> {
    return this.api.put<any>(`/admin/enrollment-requests/${id}/approve`, {});
  }

  rejectEnrollmentRequest(id: string, note?: string): Observable<any> {
    return this.api.put<any>(`/admin/enrollment-requests/${id}/reject`, { rejection_note: note });
  }

  updateUserSponsorshipSettings(
    userId: string,
    data: {
      custom_n1_rate?: number | null;
      custom_n2_rate?: number | null;
      custom_duration_months?: number | null;
      is_ambassador?: boolean;
    },
  ): Observable<any> {
    return this.api.patch<any>(`/admin/users/${userId}/sponsorship-settings`, data);
  }
}

