import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { NgIf, DecimalPipe } from '@angular/common';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { InstallPromptComponent } from '../../shared/components/install-prompt/install-prompt.component';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf, DecimalPipe, BottomNavComponent, InstallPromptComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private router = inject(Router);
  public authService = inject(AuthService);
  public cartService = inject(CartService);
  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly isNavigating = signal(false);
  readonly isMobileMenuOpen = signal(false);

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
        this.closeMobileMenu();
      }
    });
  }

  toggleMobileMenu(): void {
    const next = !this.isMobileMenuOpen();
    this.isMobileMenuOpen.set(next);
    document.body.style.overflow = next ? 'hidden' : '';
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
    document.body.style.overflow = '';
  }

  onNavSearch(input: HTMLInputElement): void {
    const q = input.value.trim();
    if (q) {
      this.router.navigate(['/search'], { queryParams: { q } });
      input.value = '';
    }
  }
}
