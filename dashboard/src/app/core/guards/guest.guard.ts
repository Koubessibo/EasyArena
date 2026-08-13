import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/auth.model';

const HOME_MAP: Record<UserRole, string> = {
  super_admin: '/admin/dashboard',
  field_owner: '/owner/overview',
  vendor: '/vendor/overview',
  field_admin: '/owner/overview',
  controller: '/owner/scanner',
  client: '/client/shop',
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  const role = auth.role();
  const dest = (role && HOME_MAP[role]) ? HOME_MAP[role] : '/owner/overview';
  return router.createUrlTree([dest]);
};
