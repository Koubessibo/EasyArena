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
    // jamais dans ce localStorage (clé réelle : xeweul_token), donc l'ancien
    // code transmettait systématiquement `token: null`.
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
      // On capture l'instance : si le composant est détruit (ngOnDestroy) ou
      // que `disconnect()` remplace le socket, il faut bien retirer le handler
      // de l'émetteur d'origine — sinon le listener reste accroché au cycle
      // de vie du socket et le composant suivant reçoit un doublon.
      const socket = this.socket;
      const handler = (d: { bookingId: string }) => obs.next(d);
      socket?.on('payment:confirmed', handler);
      return () => socket?.off('payment:confirmed', handler);
    });
  }

  onPaymentFailed(): Observable<{ bookingId: string }> {
    return new Observable(obs => {
      const socket = this.socket;
      const handler = (d: { bookingId: string }) => obs.next(d);
      socket?.on('payment:failed', handler);
      return () => socket?.off('payment:failed', handler);
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
