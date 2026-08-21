import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  private buildUrl(path: string): string {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<ApiResponse<T>>(this.buildUrl(path)).pipe(
      map(r => r.data ?? (r as any)),
      catchError(this.handleError),
    );
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<ApiResponse<T>>(this.buildUrl(path), body).pipe(
      map(r => r.data ?? (r as any)),
      catchError(this.handleError),
    );
  }

  postFile<T>(path: string, formData: FormData): Observable<T> {
    return this.http.post<ApiResponse<T>>(this.buildUrl(path), formData).pipe(
      map(r => r.data ?? (r as any)),
      catchError(this.handleError),
    );
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<ApiResponse<T>>(this.buildUrl(path), body).pipe(
      map(r => r.data ?? (r as any)),
      catchError(this.handleError),
    );
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<ApiResponse<T>>(this.buildUrl(path), body).pipe(
      map(r => r.data ?? (r as any)),
      catchError(this.handleError),
    );
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(this.buildUrl(path)).pipe(
      map(r => r.data ?? (r as any)),
      catchError(this.handleError),
    );
  }

  private handleError(err: HttpErrorResponse): Observable<never> {
    const message = err.error?.message ?? err.message ?? 'Une erreur est survenue';
    return throwError(() => new Error(Array.isArray(message) ? message[0] : message));
  }
}
