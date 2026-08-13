import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { NgIf } from '@angular/common';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, NgIf, SidebarComponent, TopbarComponent],
  template: `
    <!-- Top Route Navigation Progress Bar -->
    <div class="dash-nav-progress" [class.dash-nav-progress--active]="isNavigating()">
      <div class="dash-nav-progress__bar"></div>
    </div>

    <div class="dashboard-shell" [class.sidebar-collapsed]="sidebarCollapsed()">
      <app-sidebar
        [collapsed]="sidebarCollapsed()"
        [mobileOpen]="mobileSidebarOpen()"
        (toggleCollapse)="sidebarCollapsed.update(v => !v)"
        (closeMobile)="mobileSidebarOpen.set(false)" />
      <div class="dashboard-main">
        <app-topbar
          (openMobileSidebar)="mobileSidebarOpen.set(true)" />
        <main class="dashboard-content">
          <router-outlet />
        </main>
      </div>
      @if (mobileSidebarOpen()) {
        <div class="sidebar-overlay" (click)="mobileSidebarOpen.set(false)"></div>
      }
    </div>

    <!-- Logout Confirmation Modal -->
    <div class="logout-modal-backdrop" *ngIf="auth.showLogoutModal()" (click)="auth.cancelLogout()">
      <div class="logout-modal-card" (click)="$event.stopPropagation()">
        <div class="logout-modal-card__header">
          <div class="logout-modal-card__icon-wrap">
            <span class="material-symbols-outlined">logout</span>
          </div>
          <h3 class="logout-modal-card__title">Confirmer la Déconnexion</h3>
          <p class="logout-modal-card__desc">
            Êtes-vous sûr de vouloir vous déconnecter de votre espace EasyArena ? Vos données d'administration restent enregistrées en toute sécurité.
          </p>
        </div>
        <div class="logout-modal-card__actions">
          <button class="logout-btn logout-btn--ghost" (click)="auth.cancelLogout()" [disabled]="auth.isLoggingOut()">
            Annuler
          </button>
          <button class="logout-btn logout-btn--danger" (click)="auth.confirmLogout()" [disabled]="auth.isLoggingOut()">
            <span class="logout-spinner" *ngIf="auth.isLoggingOut()"></span>
            <ng-container *ngIf="!auth.isLoggingOut()">
              <span class="material-symbols-outlined">power_settings_new</span>
              Oui, me déconnecter
            </ng-container>
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './dashboard-layout.component.scss',
})
export class DashboardLayoutComponent {
  public auth = inject(AuthService);
  private router = inject(Router);
  sidebarCollapsed = signal(false);
  mobileSidebarOpen = signal(false);
  readonly isNavigating = signal(false);

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.isNavigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.isNavigating.set(false);
      }
    });
  }
}
