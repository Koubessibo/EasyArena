import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket?.connected) return;
    const token = localStorage.getItem('access_token');
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
