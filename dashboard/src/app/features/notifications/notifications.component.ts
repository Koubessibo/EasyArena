import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  NotificationService,
  AppNotification,
} from '../../core/services/notification.service';

interface TypeFilter {
  label: string;
  value: string;
}

/**
 * Boîte à lettres du back-office.
 *
 * Sert les 6 rôles : chaque utilisateur ne voit que ses propres lignes
 * (`user_id` côté API). Le filtre par type utilise les préfixes thématiques
 * acceptés par `GET /notifications`, ce qui garde une pagination cohérente.
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, FormsModule, PageHeaderComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private notifService = inject(NotificationService);

  readonly items = this.notifService.items;
  readonly loading = this.notifService.loading;
  readonly unreadCount = this.notifService.unreadCount;
  readonly total = this.notifService.total;

  readonly selectedType = signal('');
  readonly unreadOnly = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly loaded = signal(false);

  readonly hasMore = computed(() => this.items().length < this.total());

  readonly filters: TypeFilter[] = [
    { label: 'Tous les types', value: '' },
    { label: 'Réservations & annulations', value: 'booking_,cancellation_' },
    { label: 'Paiements & retraits', value: 'payment_,withdrawal_,commission_' },
    { label: 'Commandes boutique', value: 'order_,stock_' },
    { label: 'Terrains & planning', value: 'field_,schedule_,staff_' },
    { label: 'Billetterie & événements', value: 'ticket_,event_,scan_' },
    { label: 'Abonnements', value: 'subscription_' },
    { label: 'Compte & sécurité', value: 'account_,security_' },
    { label: 'Administration', value: 'enrollment_,system_,kpi_' },
    { label: 'Marketing', value: 'promo' },
  ];

  ngOnInit(): void {
    this.reload();
  }

  onFilterChange(value: string): void {
    this.selectedType.set(value);
    this.reload();
  }

  onUnreadOnlyChange(checked: boolean): void {
    this.unreadOnly.set(checked);
    this.reload();
  }

  reload(): void {
    this.errorMessage.set(null);
    this.notifService
      .fetch({
        page: 1,
        perPage: 20,
        type: this.selectedType() || undefined,
        unreadOnly: this.unreadOnly(),
      })
      .subscribe({
        next: () => this.loaded.set(true),
        error: () => {
          this.loaded.set(true);
          this.errorMessage.set('Impossible de charger vos notifications.');
        },
      });
  }

  loadMore(): void {
    if (this.loading()) return;
    this.notifService
      .loadMore({
        perPage: 20,
        type: this.selectedType() || undefined,
        unreadOnly: this.unreadOnly(),
      })
      .subscribe({ error: () => undefined });
  }

  markAllRead(): void {
    this.notifService.markAllAsRead().subscribe();
  }

  open(n: AppNotification): void {
    this.notifService.open(n);
  }

  // ── Rendu ────────────────────────────────────────────────────────
  iconFor(type: string): string {
    if (type.startsWith('booking') || type.startsWith('cancellation')) return 'event_available';
    if (type.startsWith('payment') || type.startsWith('withdrawal')) return 'payments';
    if (type.startsWith('commission')) return 'savings';
    if (type.startsWith('order') || type === 'stock_low') return 'shopping_bag';
    if (type.startsWith('subscription')) return 'card_membership';
    if (type.startsWith('field') || type.startsWith('schedule')) return 'sports_soccer';
    if (type.startsWith('enrollment') || type.startsWith('staff')) return 'shield_person';
    if (type.startsWith('ticket') || type.startsWith('scan')) return 'confirmation_number';
    if (type.startsWith('event')) return 'celebration';
    if (type.startsWith('account') || type.startsWith('security')) return 'lock';
    if (type === 'promo') return 'local_offer';
    return 'notifications';
  }

  /** `action` ressort en ambre et en gras : c'est une décision attendue. */
  isAction(n: AppNotification): boolean {
    return n.priority === 'action';
  }

  timeOf(iso: string): string {
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
}
