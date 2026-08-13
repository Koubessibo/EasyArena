import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map } from 'rxjs';
import { ApiService } from './api.service';
import { User } from '../models/user.model';
import { environment } from '../../../environments/environment';

const AUTH_TOKEN_KEY = 'xeweul_token';
const REFRESH_TOKEN_KEY = 'xeweul_refresh_token';
const AUTH_USER_KEY = 'xeweul_user';

function mapApiUser(u: any): User {
  return {
    id: u.id,
    fullName: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
    email: u.email ?? '',
    phone: u.phone ?? '',
    role: u.role === 'owner' ? 'field_owner' : u.role,
    avatarUrl: u.profile_photo || u.avatar_url || u.avatarUrl || '',
    isVerified: u.status === 'active',
    createdAt: u.created_at ?? '',
  };
}

import { FieldService } from './field.service';
import { ProductService } from './product.service';
import { CartService } from './cart.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);
  private fieldService = inject(FieldService);
  private productService = inject(ProductService);
  private cartService = inject(CartService);

  readonly currentUser = signal<User | null>(this.loadStoredUser());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pendingPhone = signal<string | null>(null);

  private loadStoredUser(): User | null {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private storeAuth(user: User, accessToken: string, refreshToken: string): void {
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.fieldService.reloadFavorites();
    this.productService.reloadWishlist();
    this.cartService.reloadCart();
  }

  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  login(phone: string, pin: string): Observable<any> {
    this.loading.set(true);
    this.error.set(null);
    return this.api.post<any>('/auth/login', { phone, pin }).pipe(
      tap({
        next: (res) => {
          const user = mapApiUser(res.user ?? res);
          this.storeAuth(user, res.access_token, res.refresh_token ?? '');
          this.loading.set(false);
          this.router.navigate(['/home']);
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      })
    );
  }

  register(data: { firstName: string; lastName: string; phone: string }): Observable<any> {
    this.loading.set(true);
    this.error.set(null);
    return this.api.post<any>('/auth/register', {
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
    }).pipe(
      tap({
        next: () => {
          this.pendingPhone.set(data.phone);
          this.loading.set(false);
          this.router.navigate(['/otp-verify'], { queryParams: { phone: data.phone } });
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      })
    );
  }

  verifyOtp(otp: string): Observable<any> {
    this.loading.set(true);
    this.error.set(null);
    const phone = this.pendingPhone();
    return this.api.post<any>('/auth/verify-otp', { phone, code: otp }).pipe(
      tap({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/pin-setup']);
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      })
    );
  }

  resendOtp(): Observable<any> {
    const phone = this.pendingPhone();
    return this.api.post<any>('/auth/resend-otp', { phone });
  }

  setupPin(pin: string): Observable<any> {
    this.loading.set(true);
    this.error.set(null);
    const phone = this.pendingPhone();
    return this.api.post<any>('/auth/set-pin', { phone, pin }).pipe(
      tap({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/login']);
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      })
    );
  }

  getMe(): Observable<User> {
    return this.api.get<any>('/auth/me').pipe(
      tap({
        next: (u) => {
          const user = mapApiUser(u);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
          this.currentUser.set(user);
          this.fieldService.reloadFavorites();
          this.productService.reloadWishlist();
          this.cartService.reloadCart();
        },
      })
    );
  }

  private http = inject(HttpClient);

  updateProfile(updates: { firstName?: string; lastName?: string; email?: string; profilePhoto?: string }): Observable<User> {
    return this.api.patch<any>('/auth/me', {
      first_name: updates.firstName,
      last_name: updates.lastName,
      email: updates.email,
      profile_photo: updates.profilePhoto,
    }).pipe(
      tap({
        next: (u) => {
          const user = mapApiUser(u);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
          this.currentUser.set(user);
        },
      })
    );
  }

  uploadAvatar(file: File): Observable<User> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.patch<any>(`${environment.apiUrl}/auth/me/avatar`, form).pipe(
      map(r => r?.data ?? r),
      tap((u) => {
        const user = mapApiUser(u);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  updatePin(currentPin: string, newPin: string): Observable<any> {
    return this.api.patch<any>('/auth/me/pin', { current_pin: currentPin, new_pin: newPin });
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
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem('xeweul_favorites');
    localStorage.removeItem('xeweul_wishlist');
    localStorage.removeItem('xeweul_cart');
    
    this.fieldService.clearFavorites();
    this.productService.clearWishlist();
    this.cartService.clearCart();
    
    this.currentUser.set(null);
    this.error.set(null);
    this.router.navigate(['/login']);
  }

  requestPasswordReset(phone: string): Observable<any> {
    this.pendingPhone.set(phone);
    return this.api.post<any>('/auth/forgot-pin', { phone });
  }

  submitEnrollmentRequest(data: {
    phone: string;
    first_name: string;
    last_name: string;
    role: 'owner' | 'vendor';
    field_name?: string;
    mobile_money?: string;
    shop_name?: string;
    contact_phone?: string;
    location?: string;
  }): Observable<any> {
    this.loading.set(true);
    this.error.set(null);
    return this.api.post<any>('/enrollment/requests', data).pipe(
      tap({
        next: () => this.loading.set(false),
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      })
    );
  }
}
