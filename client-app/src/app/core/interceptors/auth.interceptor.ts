import { HttpInterceptorFn, HttpBackend, HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'xeweul_token';
const REFRESH_KEY = 'xeweul_refresh_token';
const USER_KEY = 'xeweul_user';

function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  // HttpBackend bypasses interceptors — évite la dépendance circulaire
  const backend = inject(HttpBackend);

  const token = localStorage.getItem(TOKEN_KEY);
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError(err => {
      // Ne pas tenter le refresh si c'est déjà la requête de refresh
      if (err.status !== 401 || req.url.includes('refresh-token')) {
        return throwError(() => err);
      }

      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) {
        clearAuth();
        router.navigate(['/login']);
        return throwError(() => err);
      }

      // Appel direct au backend (sans passer par les interceptors)
      const http = new HttpClient(backend);
      return http.post<any>(`${environment.apiUrl}/auth/refresh-token`, { refresh_token: refreshToken }).pipe(
        switchMap(res => {
          const newToken = res?.data?.access_token ?? res?.access_token;
          if (!newToken) {
            clearAuth();
            router.navigate(['/login']);
            return throwError(() => new Error('Refresh failed'));
          }
          localStorage.setItem(TOKEN_KEY, newToken);
          // Rejoue la requête originale avec le nouveau token
          const retryReq = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
          return next(retryReq);
        }),
        catchError(() => {
          clearAuth();
          router.navigate(['/login']);
          return throwError(() => err);
        }),
      );
    }),
  );
};
