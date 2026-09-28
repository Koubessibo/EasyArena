import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subscription, interval, startWith, switchMap, tap, catchError, of } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export type NotificationPriority = 'action' | 'info' | 'digest';

/** Forme renvoyée par l'API (channel in_app uniquement). */
export interface AppNotification {
  id: string;
  channel: 'in_app';
  type: string;
  title: string | null;
  message: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  priority: NotificationPriority;
  is_read: boolean;
  read_at: string | null;
  sent_at: string;
}

export interface NotificationPage {
  data: AppNotification[];
  total: number;
  unread: number;
}

/** Notification poussée en toast, avec sa propre durée de vie. */
export interface NotificationToast extends AppNotification {
  toastId: string;
}

export interface FetchParams {
  page?: number;
  perPage?: number;
  type?: string;
  unreadOnly?: boolean;
}

const POLL_INTERVAL_MS = 60_000;
const TOAST_TTL: Record<NotificationPriority, number> = {
  action: 12_000,
  info: 5_000,
  digest: 0, // jamais de toast pour un digest
};

/**
 * Boîte à lettres in-app du back-office (tous rôles).
 *
 * Temps réel via le namespace `/notifications` avec reconnexion automatique
 * (socket.io). Si le socket n'est pas établi, un polling léger du compteur
 * de non-lus prend le relais — dans les deux cas les badges restent justes.
 *
 * Règle d'or : la source de vérité est l'API ; le socket ne fait que la
 * pousser. Tout est reconstruit par `refreshUnread()` en cas de doute.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly items = signal<AppNotification[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly unreadCount = signal(0);
  readonly connected = signal(false);
  readonly toasts = signal<NotificationToast[]>([]);

  readonly hasUnread = computed(() => this.unreadCount() > 0);

  private socket: Socket | null = null;
  private pollSub: Subscription | null = null;
  private toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Ouvre/ferme le canal en fonction de l'état de connexion, sans jamais
    // laisser un socket ouvert après déconnexion.
    effect(() => {
      if (this.auth.isAuthenticated()) this.connect();
      else this.disconnect();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  Temps réel
  // ══════════════════════════════════════════════════════════════════

  connect(): void {
    if (this.socket || !this.auth.isAuthenticated()) return;

    const token = this.auth.getToken();
    const socket = io(`${environment.wsUrl}/notifications`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 15_000,
      timeout: 10_000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.connected.set(true);
      this.stopPolling();
    });

    socket.on('disconnect', () => {
      this.connected.set(false);
      this.startPolling();
    });

    socket.io.on('reconnect_failed', () => this.startPolling());

    socket.on('notification:init', (p: { unread: number }) => {
      this.unreadCount.set(p?.unread ?? 0);
    });

    socket.on('notification:new', (n: AppNotification) => {
      if (!n?.id) return;
      this.items.update(list => (list.some(x => x.id === n.id) ? list : [n, ...list]));
      this.total.update(t => t + 1);
      this.unreadCount.update(c => c + 1);
      this.pushToast(n);
    });

    socket.on('notification:read', (p: { ids?: string[]; unread: number }) => {
      if (Array.isArray(p?.ids)) this.markLocalRead(p.ids);
      this.unreadCount.set(p?.unread ?? 0);
    });

    socket.on('notification:unread', (p: { unread: number }) => {
      this.unreadCount.set(p?.unread ?? 0);
    });

    this.startPolling();
  }

  disconnect(): void {
    this.stopPolling();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io?.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected.set(false);
    this.items.set([]);
    this.unreadCount.set(0);
    this.clearToasts();
  }

  /**
   * Filet de sécurité : si le socket n'est pas établi (réseau, jeton expiré,
   * serveur en redéploiement), le compteur de non-lus est rappelé en HTTP.
   * Le token étant rafraîchi par l'intercepteur, la boucle reste saine.
   */
  private startPolling(): void {
    if (this.pollSub) return;
    this.pollSub = interval(POLL_INTERVAL_MS)
      .pipe(startWith(0), switchMap(() => this.fetchUnreadCount()))
      .subscribe();
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  API
  // ══════════════════════════════════════════════════════════════════

  fetch(params: FetchParams = {}): Observable<NotificationPage> {
    this.loading.set(true);
    return this.api.get<NotificationPage>(this.buildPath(params)).pipe(
      tap(page => {
        const list = page?.data ?? [];
        this.page.set(params.page ?? 1);
        this.total.set(page?.total ?? list.length);
        this.unreadCount.set(page?.unread ?? this.unreadCount());
        this.items.set(list);
        this.loading.set(false);
      }),
      catchError(err => {
        this.loading.set(false);
        throw err;
      }),
    );
  }

  /** Charge la page suivante et l'ajoute à la liste (pagination infinie). */
  loadMore(params: FetchParams = {}): Observable<NotificationPage> {
    const nextPage = (params.page ?? this.page()) + 1;
    this.loading.set(true);
    return this.api
      .get<NotificationPage>(this.buildPath({ ...params, page: nextPage }))
      .pipe(
        tap(page => {
          const list = page?.data ?? [];
          this.page.set(nextPage);
          this.total.set(page?.total ?? this.total());
          this.items.update(old => [...old, ...list.filter(n => !old.some(x => x.id === n.id))]);
          this.loading.set(false);
        }),
        catchError(err => {
          this.loading.set(false);
          throw err;
        }),
      );
  }

  fetchUnreadCount(): Observable<{ unread: number }> {
    if (!this.auth.isAuthenticated()) return of({ unread: 0 });
    return this.api.get<{ unread: number }>('/notifications/unread-count').pipe(
      tap(r => this.unreadCount.set(r?.unread ?? 0)),
      catchError(() => of({ unread: this.unreadCount() })),
    );
  }

  markAsRead(id: string): Observable<unknown> | null {
    const local = this.items().find(n => n.id === id);
    if (local?.is_read) return null;

    // Optimiste : le badge doit tomber immédiatement au clic.
    this.markLocalRead([id]);
    this.unreadCount.update(c => Math.max(c - 1, 0));

    return this.api.put<unknown>(`/notifications/${id}/read`, {}).pipe(
      catchError(() => of(null)),
    );
  }

  markAllAsRead(): Observable<unknown> {
    this.items.update(list =>
      list.map(n => (n.is_read ? n : { ...n, is_read: true, read_at: new Date().toISOString() })),
    );
    this.unreadCount.set(0);
    return this.api.put<{ unread: number }>('/notifications/read-all', {}).pipe(
      tap(r => this.unreadCount.set(r?.unread ?? 0)),
      catchError(() => of({ unread: 0 })),
    );
  }

  /** Ouvre une notification : passe à lue puis navigue vers sa route cible. */
  open(n: AppNotification): void {
    this.markAsRead(n.id)?.subscribe();
    this.dismissToastsOf(n.id);
    if (n.link) void this.router.navigateByUrl(n.link);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Toasts
  // ══════════════════════════════════════════════════════════════════

  private pushToast(n: AppNotification): void {
    const ttl = TOAST_TTL[n.priority] ?? 0;
    if (ttl === 0) return;

    const toastId = `${n.id}-${Date.now()}`;
    const toast: NotificationToast = { ...n, toastId };

    // Une seule notification donnée à la fois : pas d'empilement.
    this.toasts.update(list => [toast, ...list.filter(t => t.id !== n.id)].slice(0, 3));

    this.toastTimers.set(toastId, setTimeout(() => this.dismissToast(toastId), ttl));
  }

  dismissToast(toastId: string): void {
    const timer = this.toastTimers.get(toastId);
    if (timer) clearTimeout(timer);
    this.toastTimers.delete(toastId);
    this.toasts.update(list => list.filter(t => t.toastId !== toastId));
  }

  private dismissToastsOf(notificationId: string): void {
    this.toasts()
      .filter(t => t.id === notificationId)
      .forEach(t => this.dismissToast(t.toastId));
  }

  private clearToasts(): void {
    this.toastTimers.forEach(t => clearTimeout(t));
    this.toastTimers.clear();
    this.toasts.set([]);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Privées
  // ══════════════════════════════════════════════════════════════════

  private markLocalRead(ids: string[]): void {
    if (ids.length === 0) return;
    const set = new Set(ids);
    this.items.update(list =>
      list.map(n => (set.has(n.id) && !n.is_read ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)),
    );
  }

  private buildPath(params: FetchParams): string {
    const qs: string[] = [`page=${params.page ?? 1}`, `per_page=${params.perPage ?? 20}`];
    if (params.type) qs.push(`type=${encodeURIComponent(params.type)}`);
    if (params.unreadOnly) qs.push('unread_only=true');
    return `/notifications?${qs.join('&')}`;
  }
}
