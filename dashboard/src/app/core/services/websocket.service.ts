import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket: Socket | null = null;
  private readonly auth = inject(AuthService);

  connect(): void {
    if (this.socket?.connected) return;
    // Le token est lu via AuthService : la littérale 'access_token' n'existe
    // jamais dans ce localStorage (clé réelle : xeweul_access_token), donc
    // l'ancien code transmettait systématiquement `token: null`.
    const token = this.auth.getToken();
    this.socket = io(`${environment.wsUrl}/payments`, {
      auth: { token },
      transports: ['websocket'],
    });
  }

  joinBooking(bookingId: string): void {
    this.socket?.emit('join:booking', bookingId);
  }

  onPaymentConfirmed(): Observable<{ bookingId: string }> {
    return new Observable(obs => {
      this.socket?.on('payment:confirmed', (d: { bookingId: string }) => obs.next(d));
    });
  }

  onPaymentFailed(): Observable<{ bookingId: string }> {
    return new Observable(obs => {
      this.socket?.on('payment:failed', (d: { bookingId: string }) => obs.next(d));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
