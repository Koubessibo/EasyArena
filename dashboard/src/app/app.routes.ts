import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { adminGuard } from './core/guards/admin.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  // Dashboard layout (protected)
  {
    path: '',
    loadComponent: () => import('./layout/dashboard-layout/dashboard-layout.component').then(m => m.DashboardLayoutComponent),
    canActivate: [authGuard],
    children: [
      // Super Admin
      { path: 'admin/dashboard', canActivate: [adminGuard], loadComponent: () => import('./features/super-admin/dashboard/global-dashboard.component').then(m => m.GlobalDashboardComponent) },
      { path: 'admin/users', canActivate: [adminGuard], loadComponent: () => import('./features/super-admin/user-management/user-management.component').then(m => m.UserManagementComponent) },
      { path: 'admin/financial', canActivate: [adminGuard], loadComponent: () => import('./features/super-admin/financial/admin-financial.component').then(m => m.AdminFinancialComponent) },
      // Field Owner + Field Admin + Controller
      { path: 'owner/overview', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/overview/owner-overview.component').then(m => m.OwnerOverviewComponent) },
      { path: 'owner/fields', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/fields/fields-management.component').then(m => m.FieldsManagementComponent) },
      { path: 'owner/schedule', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/schedule/schedule.component').then(m => m.ScheduleComponent) },
      { path: 'owner/earnings', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/earnings/owner-earnings.component').then(m => m.OwnerEarningsComponent) },
      { path: 'owner/withdrawals', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/withdrawals/owner-withdrawals.component').then(m => m.OwnerWithdrawalsComponent) },
      { path: 'owner/transactions', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/transactions/owner-transactions.component').then(m => m.OwnerTransactionsComponent) },
      { path: 'owner/cancellations', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/cancellations/cancellation-management.component').then(m => m.CancellationManagementComponent) },
      { path: 'owner/staff', canActivate: [roleGuard('field_owner')], loadComponent: () => import('./features/field-owner/staff/owner-staff.component').then(m => m.OwnerStaffComponent) },
      { path: 'owner/scanner', canActivate: [roleGuard('field_owner', 'field_admin', 'controller')], loadComponent: () => import('./features/field-owner/scanner/ticket-scanner.component').then(m => m.TicketScannerComponent) },
      { path: 'owner/subscriptions/new', canActivate: [roleGuard('field_owner')], loadComponent: () => import('./features/field-owner/subscriptions/plan-creation.component').then(m => m.PlanCreationComponent) },
      { path: 'owner/events/new', canActivate: [roleGuard('field_owner')], loadComponent: () => import('./features/field-owner/events/event-creation.component').then(m => m.EventCreationComponent) },
      // Vendor
      { path: 'vendor/overview', canActivate: [roleGuard('vendor')], loadComponent: () => import('./features/vendor/overview/vendor-overview.component').then(m => m.VendorOverviewComponent) },
      { path: 'vendor/products', canActivate: [roleGuard('vendor')], loadComponent: () => import('./features/vendor/products/vendor-products.component').then(m => m.VendorProductsComponent) },
      { path: 'vendor/orders', canActivate: [roleGuard('vendor')], loadComponent: () => import('./features/vendor/orders/vendor-orders.component').then(m => m.VendorOrdersComponent) },
      { path: 'vendor/earnings', canActivate: [roleGuard('vendor')], loadComponent: () => import('./features/vendor/earnings/vendor-earnings.component').then(m => m.VendorEarningsComponent) },
      // CGU Legal Pages & PWA Installation
      { path: 'cgu', loadComponent: () => import('./features/cgu/cgu.component').then(m => m.CguComponent) },
      { path: 'pwa', loadComponent: () => import('./features/pwa-install/pwa-install.component').then(m => m.PwaInstallComponent) },
      // Client App
      { path: 'client/shop', canActivate: [roleGuard('client')], loadComponent: () => import('./features/client-app/shop/client-shop.component').then(m => m.ClientShopComponent) },
      { path: 'client/fields/:fieldId/subscriptions', canActivate: [roleGuard('client')], loadComponent: () => import('./features/client-app/subscriptions/client-subscription.component').then(m => m.ClientSubscriptionComponent) },
      { path: 'client/events', canActivate: [roleGuard('client')], loadComponent: () => import('./features/client-app/events/client-events.component').then(m => m.ClientEventsComponent) },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
