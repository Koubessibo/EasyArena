import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.role() === 'super_admin') return true;
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  return router.createUrlTree(['/owner/overview']);
};
