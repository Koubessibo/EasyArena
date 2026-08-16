import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  // Splash / Onboarding (guests only)
  {
    path: 'splash',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/splash/splash.component').then(m => m.SplashComponent),
  },
  // Auth routes (guests only)
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
  },
  {
    path: 'pin-entry',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pin-entry/pin-entry.component').then(m => m.PinEntryComponent),
  },
  {
    path: 'otp-verify',
    loadComponent: () =>
      import('./features/auth/otp-verify/otp-verify.component').then(m => m.OtpVerifyComponent),
  },
  {
    path: 'pin-setup',
    loadComponent: () =>
      import('./features/auth/pin-setup/pin-setup.component').then(m => m.PinSetupComponent),
  },
  // Main layout — no global auth guard; individual child routes guard themselves
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      // ── Public routes (guests + authenticated) ──
      {
        path: 'install',
        loadComponent: () =>
          import('./features/pwa-install/pwa-install.component').then(m => m.PwaInstallComponent),
      },
      {
        path: 'pwa',
        loadComponent: () =>
          import('./features/pwa-install/pwa-install.component').then(m => m.PwaInstallComponent),
      },
      {
        path: 'terms',
        loadComponent: () =>
          import('./features/terms/terms.component').then(m => m.TermsComponent),
      },
      {
        path: 'privacy',
        loadComponent: () =>
          import('./features/terms/terms.component').then(m => m.TermsComponent),
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'fields/:id',
        loadComponent: () =>
          import('./features/fields/field-detail/field-detail.component').then(m => m.FieldDetailComponent),
      },
      {
        path: 'shop',
        loadComponent: () =>
          import('./features/shop/product-catalog/product-catalog.component').then(m => m.ProductCatalogComponent),
      },
      {
        path: 'shop/cart',
        loadComponent: () =>
          import('./features/shop/cart/cart.component').then(m => m.CartComponent),
      },
      {
        path: 'shop/payment',
        loadComponent: () =>
          import('./features/shop/payment/payment.component').then(m => m.ShopPaymentComponent),
      },
      {
        path: 'shop/:id',
        loadComponent: () =>
          import('./features/shop/product-detail/product-detail.component').then(m => m.ProductDetailComponent),
      },
      {
        path: 'orders',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/orders/my-orders.component').then(m => m.MyOrdersComponent),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./features/events/events.component').then(m => m.EventsComponent),
      },
      {
        path: 'my-tickets',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/events/my-tickets.component').then(m => m.MyTicketsComponent),
      },
      {
        path: 'subscriptions',
        loadComponent: () =>
          import('./features/subscriptions/subscriptions.component').then(m => m.SubscriptionsComponent),
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/search/search.component').then(m => m.SearchComponent),
      },
      // ── Auth-required routes ──
      {
        path: 'booking/confirmation',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/booking-confirmation/booking-confirmation.component').then(m => m.BookingConfirmationComponent),
      },
      {
        path: 'booking/summary',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/booking-summary/booking-summary.component').then(m => m.BookingSummaryComponent),
      },
      {
        path: 'booking/payment',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/payment/payment.component').then(m => m.PaymentComponent),
      },
      {
        path: 'booking/history',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/booking-history/booking-history.component').then(m => m.BookingHistoryComponent),
      },
      {
        path: 'booking/payment-failed',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/payment-failed/payment-failed.component').then(m => m.PaymentFailedComponent),
      },
      {
        path: 'booking/:id/rate',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/booking-rate/booking-rate.component').then(m => m.BookingRateComponent),
      },
      {
        path: 'booking/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/booking/booking-detail/booking-detail.component').then(m => m.BookingDetailComponent),
      },
      {
        path: 'favorites',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/favorites/favorites.component').then(m => m.FavoritesComponent),
      },
      {
        path: 'notifications',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/notifications/notifications.component').then(m => m.NotificationsComponent),
      },
      {
        path: 'profile',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'profile/edit',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/profile/edit-profile/edit-profile.component').then(m => m.EditProfileComponent),
      },
      {
        path: 'profile/transactions',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/profile/transactions/transactions.component').then(m => m.TransactionsComponent),
      },
      {
        path: 'profile/ambassador-wallet',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/profile/ambassador-wallet/ambassador-wallet.component').then(m => m.AmbassadorWalletComponent),
      },
    ],
  },
  // Catch-all
  {
    path: '**',
    redirectTo: 'home',
  },
];
