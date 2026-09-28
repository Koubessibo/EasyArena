import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor, NgClass, DatePipe } from '@angular/common';
import {
  NotificationService,
  AppNotification,
} from '../../core/services/notification.service';

type NotifFilter = 'all' | 'bookings' | 'payments' | 'orders' | 'promotions';
type DayGroup = 'today' | 'yesterday' | 'week' | 'earlier';

interface FilterChip {
  label: string;
  value: NotifFilter;
  /** Critère `type` envoyé à l'API (préfixes thématiques, cf. DTO). */
  type: string;
}

const DAY = 86_400_000;

/**
 * Boîte à lettres du client.
 *
 * Plus aucune donnée en dur : tout est lu depuis `NotificationService`
 * (HTTP au chargement + push WebSocket). Le service reste la source unique
 * pour que le badge du header et la liste ne puissent jamais diverger.
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, NgClass, DatePipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private notifService = inject(NotificationService);

  readonly activeFilter = signal<NotifFilter>('all');
  readonly errorMessage = signal<string | null>(null);
  readonly pageLoaded = signal(false);

  readonly notifications = this.notifService.items;
  readonly loading = this.notifService.loading;
  readonly unreadCount = this.notifService.unreadCount;

  readonly filters: FilterChip[] = [
    { label: 'Toutes', value: 'all', type: '' },
    { label: 'Réservations', value: 'bookings', type: 'booking_,cancellation_' },
    { label: 'Paiements', value: 'payments', type: 'payment_,withdrawal_,commission_' },
    { label: 'Commandes', value: 'orders', type: 'order_,stock_' },
    { label: 'Promotions', value: 'promotions', type: 'promo' },
  ];

  readonly hasMore = computed(
    () => this.notifications().length < this.notifService.total(),
  );

  readonly todayNotifs = computed(() => this.groupBy('today'));
  readonly yesterdayNotifs = computed(() => this.groupBy('yesterday'));
  readonly weekNotifs = computed(() => this.groupBy('week'));
  readonly earlierNotifs = computed(() => this.groupBy('earlier'));

  /** Groupes chronologiques, groupes vides retirés. */
  readonly groups = computed(() =>
    [
      { label: 'Aujourd\u2019hui', items: this.todayNotifs(), today: true },
      { label: 'Hier', items: this.yesterdayNotifs(), today: false },
      { label: 'Cette semaine', items: this.weekNotifs(), today: false },
      { label: 'Plus t\u00f4t', items: this.earlierNotifs(), today: false },
    ].filter((g) => g.items.length > 0),
  );

  ngOnInit(): void {
    this.load();
  }

  setFilter(filter: NotifFilter): void {
    if (this.activeFilter() === filter) return;
    this.activeFilter.set(filter);
    this.load();
  }

  markAllRead(): void {
    this.notifService.markAllAsRead().subscribe();
  }

  /** Clic sur une entrée : bascule en lu puis ouvre la route du `link`. */
  open(notif: AppNotification): void {
    this.notifService.open(notif);
  }

  loadMore(): void {
    if (this.loading()) return;
    this.errorMessage.set(null);
    this.notifService
      .loadMore({ perPage: 20, type: this.currentType() })
      .subscribe({ error: () => this.setError() });
  }

  getNotifIcon(type: string): string {
    if (type.startsWith('booking') || type.startsWith('cancellation')) return 'event_available';
    if (type.startsWith('payment') || type.startsWith('withdrawal')) return 'payments';
    if (type.startsWith('commission')) return 'savings';
    if (type.startsWith('order') || type === 'stock_low') return 'shopping_bag';
    if (type.startsWith('subscription')) return 'card_membership';
    if (type.startsWith('field') || type.startsWith('schedule')) return 'sports_soccer';
    if (type.startsWith('enrollment') || type.startsWith('staff')) return 'shield_person';
    if (type.startsWith('ticket')) return 'confirmation_number';
    if (type.startsWith('event')) return 'celebration';
    if (type.startsWith('account') || type.startsWith('security')) return 'lock';
    if (type === 'promo') return 'local_offer';
    return 'notifications';
  }

  getNotifIconClass(type: string): string {
    if (type.startsWith('cancellation') || type.endsWith('failed') || type.endsWith('cancelled')) {
      return 'notif-icon--red';
    }
    if (type.startsWith('booking') || type.startsWith('event') || type.startsWith('ticket')) {
      return 'notif-icon--green';
    }
    if (type.startsWith('payment') || type.startsWith('order') || type.startsWith('withdrawal')) {
      return 'notif-icon--blue';
    }
    if (type.startsWith('subscription') || type.startsWith('schedule')) {
      return 'notif-icon--orange';
    }
    if (type === 'promo') return 'notif-icon--purple';
    return 'notif-icon--blue';
  }

  /** Durée relative en français : « il y a 5 min », « hier », « 12 mars ». */
  relativeTime(iso: string): string {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return '';
    const diff = Date.now() - ts;

    if (diff < 60_000) return 'À l\'instant';
    if (diff < 3_600_000) return `Il y a ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `Il y a ${Math.floor(diff / 3_600_000)} h`;

    const days = Math.floor(diff / 86_400_000);
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  private load(): void {
    this.errorMessage.set(null);
    this.notifService
      .fetch({ page: 1, perPage: 20, type: this.currentType() })
      .subscribe({
        next: () => this.pageLoaded.set(true),
        error: () => this.setError(),
      });
  }

  private setError(): void {
    this.pageLoaded.set(true);
    this.errorMessage.set('Impossible de charger vos notifications.');
  }

  private currentType(): string | undefined {
    return this.filters.find((f) => f.value === this.activeFilter())?.type || undefined;
  }

  private groupBy(group: DayGroup): AppNotification[] {
    return this.notifications().filter((n) => this.dayOf(n.sent_at) === group);
  }

  private dayOf(iso: string): DayGroup {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 'earlier';

    const startOfToday = new Date().setHours(0, 0, 0, 0);
    if (ts >= startOfToday) return 'today';
    if (ts >= startOfToday - DAY) return 'yesterday';
    if (ts >= startOfToday - 7 * DAY) return 'week';
    return 'earlier';
  }
}
