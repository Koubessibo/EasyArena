import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/auth.model';

export function roleGuard(...allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
    const role = auth.role();
    if (role && allowedRoles.includes(role)) return true;
    const home: Record<UserRole, string> = {
      super_admin: '/admin/dashboard',
      field_owner: '/owner/overview',
      vendor: '/vendor/overview',
      field_admin: '/owner/overview',
      controller: '/owner/overview',
      client: '/client/shop',
    };
    return router.createUrlTree([home[role!]]);
  };
}
