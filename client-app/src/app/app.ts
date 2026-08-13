import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { InstallPromptComponent } from './shared/components/install-prompt/install-prompt.component';
import { CookieConsentComponent } from './shared/components/cookie-consent/cookie-consent.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, InstallPromptComponent, CookieConsentComponent],
  template: `
    <router-outlet />
    <app-install-prompt />
    <app-cookie-consent />
  `,
  styles: [':host { display: block; min-height: 100vh; }'],
})
export class App {
  private router = inject(Router);

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }
}

