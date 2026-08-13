import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  icon: string;
  label: string;
  path: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgFor, NgIf],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Input() mobileOpen = false;
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() closeMobile = new EventEmitter<void>();

  private auth = inject(AuthService);
  user = this.auth.currentUser;

  navItems = computed<NavItem[]>(() => {
    const role = this.auth.role();
    if (role === 'super_admin') return [
      { icon: 'dashboard', label: 'Vue d\'ensemble', path: '/admin/dashboard' },
      { icon: 'group', label: 'Utilisateurs', path: '/admin/users' },
      { icon: 'payments', label: 'Finances', path: '/admin/financial' },
      { icon: 'description', label: 'CGU & Légales', path: '/cgu' },
      { icon: 'download_for_offline', label: 'Installer App PWA', path: '/pwa' },
    ];
    if (role === 'field_owner') return [
      { icon: 'sports_soccer', label: 'Vue d\'ensemble', path: '/owner/overview' },
      { icon: 'qr_code_scanner', label: 'Scanner un billet', path: '/owner/scanner' },
      { icon: 'map', label: 'Mes Terrains', path: '/owner/fields' },
      { icon: 'calendar_month', label: 'Planning', path: '/owner/schedule' },
      { icon: 'card_membership', label: 'Abonnements', path: '/owner/subscriptions/new' },
      { icon: 'event', label: 'Événements', path: '/owner/events/new' },
      { icon: 'cancel', label: 'Annulations', path: '/owner/cancellations' },
      { icon: 'payments', label: 'Revenus', path: '/owner/earnings' },
      { icon: 'account_balance_wallet', label: 'Retraits', path: '/owner/withdrawals' },
      { icon: 'receipt_long', label: 'Transactions', path: '/owner/transactions' },
      { icon: 'group', label: 'Équipe', path: '/owner/staff' },
      { icon: 'description', label: 'CGU & Légales', path: '/cgu' },
      { icon: 'download_for_offline', label: 'Installer App PWA', path: '/pwa' },
    ];
    if (role === 'field_admin') return [
      { icon: 'sports_soccer', label: 'Vue d\'ensemble', path: '/owner/overview' },
      { icon: 'qr_code_scanner', label: 'Scanner un billet', path: '/owner/scanner' },
      { icon: 'map', label: 'Mes Terrains', path: '/owner/fields' },
      { icon: 'calendar_month', label: 'Planning', path: '/owner/schedule' },
      { icon: 'cancel', label: 'Annulations', path: '/owner/cancellations' },
      { icon: 'payments', label: 'Revenus', path: '/owner/earnings' },
      { icon: 'account_balance_wallet', label: 'Retraits', path: '/owner/withdrawals' },
      { icon: 'receipt_long', label: 'Transactions', path: '/owner/transactions' },
      { icon: 'description', label: 'CGU & Légales', path: '/cgu' },
      { icon: 'download_for_offline', label: 'Installer App PWA', path: '/pwa' },
    ];
    if (role === 'controller') return [
      { icon: 'qr_code_scanner', label: 'Scanner un billet', path: '/owner/scanner' },
      { icon: 'calendar_month', label: 'Planning des terrains', path: '/owner/schedule' },
      { icon: 'description', label: 'CGU & Légales', path: '/cgu' },
      { icon: 'download_for_offline', label: 'Installer App PWA', path: '/pwa' },
    ];
    if (role === 'client') return [
      { icon: 'shopping_bag', label: 'Boutique', path: '/client/shop' },
      { icon: 'event', label: 'Événements', path: '/client/events' },
      { icon: 'card_membership', label: 'Abonnements', path: '/client/fields/2b2a629b-8736-488d-8f57-4abe1251644c/subscriptions' },
      { icon: 'description', label: 'CGU & Légales', path: '/cgu' },
      { icon: 'download_for_offline', label: 'Installer App PWA', path: '/pwa' },
    ];
    if (role === 'vendor') return [
      { icon: 'analytics', label: 'Vue d\'ensemble', path: '/vendor/overview' },
      { icon: 'inventory_2', label: 'Produits', path: '/vendor/products' },
      { icon: 'shopping_cart', label: 'Commandes', path: '/vendor/orders' },
      { icon: 'payments', label: 'Revenus', path: '/vendor/earnings' },
      { icon: 'description', label: 'CGU & Légales', path: '/cgu' },
      { icon: 'download_for_offline', label: 'Installer App PWA', path: '/pwa' },
    ];
    return [];
  });

  get initials(): string {
    const name = this.user()?.name ?? '';
    return name.split(' ').map(n => n.charAt(0)).join('').slice(0, 2).toUpperCase() || 'U';
  }

  logout(): void {
    this.auth.promptLogout();
  }
}
