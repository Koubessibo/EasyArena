import { Component, OnInit, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';

const COOKIE_CONSENT_KEY = 'ea_cookie_consent';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [NgIf, RouterLink],
  templateUrl: './cookie-consent.component.html',
  styleUrl: './cookie-consent.component.scss',
})
export class CookieConsentComponent implements OnInit {
  readonly showConsent = signal(false);

  ngOnInit(): void {
    const hasConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!hasConsent) {
      this.showConsent.set(true);
    }
  }

  acceptAll(): void {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'all');
    this.showConsent.set(false);
  }

  acceptEssential(): void {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'essential');
    this.showConsent.set(false);
  }
}
