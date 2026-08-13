import { Component, OnInit, OnDestroy, signal, inject, effect } from '@angular/core';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-install-prompt',
  standalone: true,
  imports: [NgIf],
  templateUrl: './install-prompt.component.html',
  styleUrl: './install-prompt.component.scss',
})
export class InstallPromptComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);

  showPrompt = signal(false);
  isInstalled = signal(false);
  deferredPrompt: any = null;

  private beforeInstallHandler = (e: Event) => {
    e.preventDefault();
    this.deferredPrompt = e;
    if (this.authService.isAuthenticated()) {
      this.showPrompt.set(true);
    }
  };

  private appInstalledHandler = () => {
    this.showPrompt.set(false);
    this.isInstalled.set(true);
  };

  constructor() {
    // React whenever auth state changes — show banner immediately on login
    effect(() => {
      const authenticated = this.authService.isAuthenticated();
      if (authenticated && !this.isInStandaloneMode()) {
        setTimeout(() => {
          if (this.authService.isAuthenticated()) {
            this.showPrompt.set(true);
          }
        }, 1200);
      } else if (!authenticated) {
        this.showPrompt.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.isInstalled.set(this.isInStandaloneMode());
    if (this.isInStandaloneMode()) return;

    window.addEventListener('beforeinstallprompt', this.beforeInstallHandler);
    window.addEventListener('appinstalled', this.appInstalledHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.beforeInstallHandler);
    window.removeEventListener('appinstalled', this.appInstalledHandler);
  }

  async install(): Promise<void> {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      this.showPrompt.set(false);
      if (outcome === 'accepted') {
        this.isInstalled.set(true);
      }
    } else {
      window.location.href = '/install';
    }
  }

  dismiss(): void {
    this.showPrompt.set(false);
  }

  private isInStandaloneMode(): boolean {
    return (window.navigator as any).standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
  }
}
