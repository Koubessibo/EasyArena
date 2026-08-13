import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/payments' })
export class PaymentGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join:booking')
  handleJoinBooking(client: Socket, bookingId: string): void {
    void client.join(`booking:${bookingId}`);
  }

  notifyPaymentConfirmed(bookingId: string): void {
    this.server.to(`booking:${bookingId}`).emit('payment:confirmed', { bookingId });
  }

  notifyPaymentFailed(bookingId: string): void {
    this.server.to(`booking:${bookingId}`).emit('payment:failed', { bookingId });
  }
}
