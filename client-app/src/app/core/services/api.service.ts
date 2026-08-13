import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  get<T>(path: string): Observable<T> {
    return this.http.get<any>(`${this.base}${path}`).pipe(
      map(r => r.data ?? r),
      catchError(this.handleError)
    );
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<any>(`${this.base}${path}`, body).pipe(
      map(r => (r && 'data' in r) ? r.data : r),
      catchError(this.handleError)
    );
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<any>(`${this.base}${path}`, body).pipe(
      map(r => r.data ?? r),
      catchError(this.handleError)
    );
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<any>(`${this.base}${path}`, body).pipe(
      map(r => r.data ?? r),
      catchError(this.handleError)
    );
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<any>(`${this.base}${path}`).pipe(
      map(r => r?.data ?? r),
      catchError(this.handleError)
    );
  }

  private handleError(err: HttpErrorResponse): Observable<never> {
    let message = 'Une erreur est survenue.';
    if (err.status === 401) {
      message = 'Session expirée. Veuillez vous reconnecter.';
    } else if (err.status === 403) {
      message = 'Accès non autorisé.';
    } else if (err.status === 404) {
      message = 'Ressource introuvable.';
    } else if (err.status === 422 || err.status === 400) {
      const msg = err.error?.message;
      message = Array.isArray(msg) ? msg[0] : (msg ?? message);
    } else if (err.status === 409) {
      const msg = err.error?.message;
      message = Array.isArray(msg) ? msg[0] : (msg ?? 'Ce créneau est déjà réservé.');
    } else if (err.status >= 500) {
      message = 'Erreur serveur. Veuillez réessayer plus tard.';
    }
    return throwError(() => new Error(message));
  }
}
