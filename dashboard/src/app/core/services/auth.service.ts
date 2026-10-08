import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { DashboardUser, UserRole } from '../models/auth.model';
import { ApiService } from './api.service';

const ROLE_MAP: Record<string, UserRole> = {
  admin: 'super_admin',
  owner: 'field_owner',
  vendor: 'vendor',
  field_admin: 'field_admin',
  controller: 'controller',
  client: 'client',
};

const HOME_MAP: Record<UserRole, string> = {
  super_admin: '/admin/dashboard',
  field_owner: '/owner/overview',
  vendor: '/vendor/overview',
  field_admin: '/owner/overview',
  controller: '/owner/scanner',
  client: '/client/shop',
};

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    phone: string;
    first_name: string;
    last_name: string;
    email?: string;
    role: string;
    status?: string;
    created_at: string;
    can_withdraw?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private api = inject(ApiService);

  readonly currentUser = signal<DashboardUser | null>(this.loadFromStorage());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed(() => this.currentUser()?.role ?? null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly mustChangePin = signal(false);
  readonly pendingPhone = signal('');
  /**
   * Preuve de possession du numéro, délivrée par /auth/verify-otp et exigée
   * par /auth/set-pin. Sans elle, l'API refuse de définir un code PIN.
   */
  private readonly pinSetupToken = signal<string | null>(null);

  private loadFromStorage(): DashboardUser | null {
    try {
      const raw = localStorage.getItem('xeweul_dash_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  login(phone: string, pin: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.post<any>('/auth/login', { phone, pin }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.must_change_pin) {
          this.pendingPhone.set(res.phone);
          this.mustChangePin.set(true);
          return;
        }
        this.storeAndNavigate(res as LoginResponse);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  forgotPassword(phone: string): Observable<unknown> {
    this.pendingPhone.set(phone);
    return this.api.post<unknown>('/auth/forgot-password', { phone });
  }

  forgotPin(phone: string): Observable<unknown> {
    return this.forgotPassword(phone);
  }

  resetPassword(data: { phone: string; otp: string; newPassword: string }): Observable<any> {
    return this.api.post<any>('/auth/reset-password', data);
  }

  verifyOtpForPinChange(otp: string): Observable<any> {
    return this.api.post<any>('/auth/verify-otp', { phone: this.pendingPhone(), code: otp }).pipe(
      tap((res) => this.pinSetupToken.set(res?.setup_token ?? null)),
    );
  }

  setNewPin(pin: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.post<LoginResponse>('/auth/set-pin', {
      phone: this.pendingPhone(),
      pin,
      setup_token: this.pinSetupToken(),
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.pinSetupToken.set(null);
        this.mustChangePin.set(false);
        this.pendingPhone.set('');
        this.storeAndNavigate(res);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  private storeAndNavigate(res: LoginResponse): void {
    localStorage.setItem('xeweul_access_token', res.access_token);
    localStorage.setItem('xeweul_refresh_token', res.refresh_token);

    const dashRole: UserRole = ROLE_MAP[res.user.role] ?? 'vendor';
    const dashUser: DashboardUser = {
      id: res.user.id,
      name: `${res.user.first_name} ${res.user.last_name}`.trim(),
      email: res.user.email ?? '',
      phone: res.user.phone,
      role: dashRole,
      status: res.user.status ?? 'active',
      isVerified: true,
      createdAt: res.user.created_at,
      ...(res.user.can_withdraw !== undefined ? { can_withdraw: res.user.can_withdraw } : {}),
    };

    this.currentUser.set(dashUser);
    localStorage.setItem('xeweul_dash_user', JSON.stringify(dashUser));
    this.router.navigate([HOME_MAP[dashRole]]);
  }

  readonly showLogoutModal = signal(false);
  readonly isLoggingOut = signal(false);

  promptLogout(): void {
    this.showLogoutModal.set(true);
  }

  cancelLogout(): void {
    this.showLogoutModal.set(false);
  }

  confirmLogout(): void {
    this.isLoggingOut.set(true);
    setTimeout(() => {
      this.logout();
      this.isLoggingOut.set(false);
      this.showLogoutModal.set(false);
    }, 600);
  }

  logout(): void {
    this.currentUser.set(null);
    this.mustChangePin.set(false);
    this.pendingPhone.set('');
    localStorage.removeItem('xeweul_access_token');
    localStorage.removeItem('xeweul_refresh_token');
    localStorage.removeItem('xeweul_dash_user');
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('xeweul_access_token');
  }
}
