import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpClient, HttpBackend } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const backend = inject(HttpBackend);
  const token = localStorage.getItem('xeweul_access_token');

  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError(err => {
      if (err.status !== 401) return throwError(() => err);

      const refreshToken = localStorage.getItem('xeweul_refresh_token');
      if (!refreshToken) {
        auth.logout();
        return throwError(() => err);
      }

      // Use HttpBackend directly to bypass interceptors (avoid infinite loop)
      const http = new HttpClient(backend);
      return http.post<any>(`${environment.apiUrl}/auth/refresh-token`, { refresh_token: refreshToken }).pipe(
        switchMap(res => {
          const newAccess: string | undefined = res?.data?.access_token ?? res?.access_token;
          const newRefresh: string | undefined = res?.data?.refresh_token ?? res?.refresh_token;

          if (!newAccess) {
            auth.logout();
            return throwError(() => err);
          }

          localStorage.setItem('xeweul_access_token', newAccess);
          if (newRefresh) localStorage.setItem('xeweul_refresh_token', newRefresh);

          // Retry the original request with the new token
          const retried = req.clone({ setHeaders: { Authorization: `Bearer ${newAccess}` } });
          return next(retried);
        }),
        catchError(() => {
          auth.logout();
          return throwError(() => err);
        }),
      );
    }),
  );
};
