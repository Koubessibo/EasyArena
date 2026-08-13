import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor } from '@angular/common';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgFor],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss',
})
export class BottomNavComponent {
  readonly navItems: NavItem[] = [
    { label: 'Accueil', icon: 'home', route: '/home' },
    { label: 'Réservations', icon: 'calendar_today', route: '/booking/history' },
    { label: 'Boutique', icon: 'shopping_bag', route: '/shop' },
    { label: 'Profil', icon: 'person', route: '/profile' },
  ];
}
