import { Component, Output, EventEmitter, inject, signal, computed, HostListener } from '@angular/core';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import {
  NotificationService,
  AppNotification,
} from '../../../core/services/notification.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, RouterLink],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  @Output() openMobileSidebar = new EventEmitter<void>();
  private auth = inject(AuthService);
  readonly notifService = inject(NotificationService);

  user = this.auth.currentUser;
  userMenuOpen = signal(false);
  notifMenuOpen = signal(false);

  /** Aperçu de la cloche : les 8 plus récentes. */
  readonly recentNotifs = computed(() => this.notifService.items().slice(0, 8));
  readonly unreadCount = this.notifService.unreadCount;
  readonly notifLoading = this.notifService.loading;

  get initials(): string {
    const name = this.user()?.name ?? '';
    return name.split(' ').map(n => n.charAt(0)).join('').slice(0, 2).toUpperCase() || 'U';
  }

  logout(): void { this.auth.promptLogout(); }

  // ── Menus ────────────────────────────────────────────────────────
  toggleUserMenu(): void {
    this.notifMenuOpen.set(false);
    this.userMenuOpen.update(v => !v);
  }

  toggleNotifMenu(): void {
    this.userMenuOpen.set(false);
    const next = !this.notifMenuOpen();
    this.notifMenuOpen.set(next);
    // Un aperçu vide serait inutile : on peuple la liste à la première ouverture.
    if (next && this.notifService.items().length === 0 && !this.notifLoading()) {
      this.notifService.fetch({ perPage: 8 }).subscribe({ error: () => undefined });
    }
  }

  /** Clic extérieur : ferme les deux panneaux (l'utilisateur clique ailleurs). */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.userMenuOpen.set(false);
    this.notifMenuOpen.set(false);
  }

  markAllRead(event: Event): void {
    event.stopPropagation();
    this.notifService.markAllAsRead().subscribe();
  }

  openNotif(n: AppNotification, event: Event): void {
    event.stopPropagation();
    this.notifService.open(n);
    this.notifMenuOpen.set(false);
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
    if (type.startsWith('ticket')) return 'confirmation_number';
    if (type.startsWith('event')) return 'celebration';
    if (type.startsWith('account') || type.startsWith('security')) return 'lock';
    if (type === 'promo') return 'local_offer';
    return 'notifications';
  }

  /** Priorité visuelle : `action` ressort, le reste reste neutre. */
  isPriority(n: AppNotification): boolean {
    return n.priority === 'action';
  }

  timeOf(iso: string): string {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return '';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'À l\'instant';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
    const days = Math.floor(diff / 86_400_000);
    if (days === 1) return 'Hier';
    if (days < 7) return `${days} j`;
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
}
