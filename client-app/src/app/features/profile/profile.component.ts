import { Component, signal, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { NgIf, NgFor, CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { SponsorshipService } from '../../core/services/sponsorship.service';

interface ProfileMenuSection {
  title: string;
  items: ProfileMenuItem[];
}

interface ProfileMenuItem {
  label: string;
  icon: string;
  route?: string;
  action?: string;
  badge?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [NgIf, NgFor, CommonModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private bookingService = inject(BookingService);
  private sponsorshipService = inject(SponsorshipService);
  private router = inject(Router);

  readonly currentUser = this.authService.currentUser;

  readonly upcomingCount = signal(0);
  readonly totalSpent = signal(0);
  readonly bookingsCount = signal(0);
  statsLoading = signal(true);
  isUploading = signal(false);
  showSponsorshipMenu = signal(false);

  private _deferredPrompt = signal<any>(null);

  readonly isInstalled = signal(
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );

  private beforeInstallCapture = (e: Event) => {
    e.preventDefault();
    this._deferredPrompt.set(e);
  };

  sponsorshipChecked = signal(false);

  readonly menuSections = computed<ProfileMenuSection[]>(() => {
    const activityItems: ProfileMenuItem[] = [
      { label: 'Mes réservations', icon: 'calendar_today', route: '/booking/history' },
      { label: 'Mes billets', icon: 'confirmation_number', route: '/my-tickets' },
      { label: 'Mes commandes', icon: 'shopping_bag', route: '/orders' },
      { label: 'Historique des transactions', icon: 'receipt_long', route: '/profile/transactions' },
    ];
    if (this.sponsorshipChecked() && this.showSponsorshipMenu()) {
      activityItems.push({ label: 'Parrainage & Gains', icon: 'group_add', route: '/profile/ambassador-wallet' });
    }
    return [
      { title: 'Mon activité', items: activityItems },
      {
        title: 'Paramètres',
        items: [
          { label: 'Modifier mon profil', icon: 'edit', route: '/profile/edit' },
          { label: 'Notifications', icon: 'notifications', route: '/notifications' },
        ],
      },
      {
        title: 'Légal',
        items: [
          { label: 'Conditions d\'utilisation', icon: 'description', route: '/terms' },
        ],
      },
      {
        title: '',
        items: [
          { label: 'Se déconnecter', icon: 'logout', action: 'logout', danger: true },
        ],
      },
    ];
  });

  ngOnInit(): void {
    window.addEventListener('beforeinstallprompt', this.beforeInstallCapture);

    this.sponsorshipService.getMyStats().subscribe({
      next: (stats) => {
        if (stats.is_ambassador || stats.n1_count > 0) {
          this.showSponsorshipMenu.set(true);
        }
        this.sponsorshipChecked.set(true);
      },
      error: () => {
        this.sponsorshipChecked.set(true);
      },
    });

    this.bookingService.getBookings().subscribe({
      next: (bookings) => {
        const upcoming = bookings.filter(
          b => b.status === 'confirmed' || b.status === 'pending'
        ).length;
        this.upcomingCount.set(upcoming);
        this.bookingsCount.set(bookings.length);

        const spent = bookings
          .filter(b => b.payment?.status === 'paid')
          .reduce((acc, b) => acc + (b.pricing?.total ?? 0), 0);
        this.totalSpent.set(spent);
        this.statsLoading.set(false);
      },
      error: () => this.statsLoading.set(false),
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.beforeInstallCapture);
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    this.isUploading.set(true);

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) { height = Math.round(height * (MAX_SIZE / width)); width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width = Math.round(width * (MAX_SIZE / height)); height = MAX_SIZE; }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          this.authService.updateProfile({ profilePhoto: compressedBase64 }).subscribe({
            next: () => this.isUploading.set(false),
            error: () => this.isUploading.set(false),
          });
        } else {
          this.isUploading.set(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeAvatar(event: Event): void {
    event.stopPropagation();
    this.isUploading.set(true);
    this.authService.updateProfile({ profilePhoto: '' }).subscribe({
      next: () => this.isUploading.set(false),
      error: () => this.isUploading.set(false),
    });
  }

  async installPwa(): Promise<void> {
    const prompt = this._deferredPrompt();
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') this.isInstalled.set(true);
      this._deferredPrompt.set(null);
    } else {
      this.router.navigate(['/install']);
    }
  }

  formatCFA(amount: number): string {
    if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1) + 'M FCFA';
    if (amount >= 1_000) return (amount / 1_000).toFixed(0) + 'k FCFA';
    return amount.toLocaleString('fr-FR') + ' FCFA';
  }

  handleMenuAction(item: ProfileMenuItem): void {
    if (item.action === 'logout') {
      this.authService.promptLogout();
    } else if (item.route) {
      this.router.navigate([item.route]);
    }
  }
}
