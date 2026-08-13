import { Component, inject, OnInit, signal, viewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import * as QRCode from 'qrcode';

export interface SportEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  description: string;
  ticket_price: number;
  cover_image_url: string | null;
}

export interface EventTicket {
  id: string;
  qrCodeToken: string;
  status: string;
  event: SportEvent;
}

@Component({
  selector: 'app-client-events',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-events.component.html',
  styleUrls: ['./client-events.component.scss']
})
export class ClientEventsComponent implements OnInit {
  private api = inject(ApiService);
  private wsService = inject(WebSocketService);

  events = signal<SportEvent[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  
  processingEventId = signal<string | null>(null);
  purchasedTicket = signal<EventTicket | null>(null);

  // Payment state
  selectedEventForPayment = signal<SportEvent | null>(null);
  paymentForm = {
    operator: 'WAVE',
    phone: ''
  };

  // Gateway State
  isAwaitingPayment = signal(false);
  paymentGatewayUrls = signal<any>(null);
  pendingTicketId = signal<string | null>(null);

  readonly qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  constructor() {
    effect(() => {
      const ticket = this.purchasedTicket();
      const canvasEl = this.qrCanvas()?.nativeElement;
      const token = ticket?.qrCodeToken || (ticket as any)?.qr_code_token;
      
      if (canvasEl && token) {
        QRCode.toCanvas(canvasEl, token, {
          width: 250,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        }, (error) => {
          if (error) console.error('Erreur de génération QR Code', error);
        });
      }
    });
  }

  ngOnInit(): void {
    this.fetchEvents();
  }

  fetchEvents(): void {
    this.isLoading.set(true);
    this.api.get<any>('/events/active').subscribe({
      next: (res) => {
        this.events.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Erreur lors du chargement des événements sportifs.');
        this.isLoading.set(false);
      }
    });
  }

  openPaymentModal(event: SportEvent): void {
    if (event.ticket_price > 0) {
      this.selectedEventForPayment.set(event);
      this.paymentForm = { operator: 'WAVE', phone: '' };
      this.isAwaitingPayment.set(false);
      this.paymentGatewayUrls.set(null);
    } else {
      this.confirmPayment(event);
    }
  }

  closePaymentModal(): void {
    this.selectedEventForPayment.set(null);
    this.isAwaitingPayment.set(false);
    this.wsService.disconnect();
  }

  confirmPayment(event?: SportEvent): void {
    const ev = event || this.selectedEventForPayment();
    if (!ev || this.processingEventId()) return;

    this.processingEventId.set(ev.id);
    this.errorMessage.set(null);

    this.api.post<any>('/tickets/buy', { 
      eventId: ev.id, 
      operator: this.paymentForm.operator,
      phone: this.paymentForm.phone 
    }).subscribe({
      next: (res) => {
        this.processingEventId.set(null);
        const data = res?.data;

        if (data?.status === 'PENDING_PAYMENT') {
           this.isAwaitingPayment.set(true);
           this.paymentGatewayUrls.set({ redirect_url: data.redirect_url, urls: data.urls });
           this.pendingTicketId.set(data.ticketId);

           this.wsService.connect();
           this.wsService.joinBooking(data.ticketId);
           
           const wsSub = this.wsService.onPaymentConfirmed().subscribe(() => {
              this.wsService.disconnect();
              wsSub.unsubscribe();
              this.isAwaitingPayment.set(false);
              this.selectedEventForPayment.set(null);

              this.api.get<any>(`/tickets/my-tickets`).subscribe(res => {
                  const tickets = res?.data || [];
                  const confirmedTicket = tickets.find((t: any) => t.id === data.ticketId);
                  if (confirmedTicket) {
                     this.purchasedTicket.set(confirmedTicket);
                  } else {
                     alert("Paiement validé ! Retrouvez votre ticket dans l'historique.");
                  }
              }, () => {
                  alert("Paiement validé ! Retrouvez votre ticket dans l'historique.");
              });
           });

           const wsFail = this.wsService.onPaymentFailed().subscribe(() => {
              this.wsService.disconnect();
              wsFail.unsubscribe();
              this.isAwaitingPayment.set(false);
              this.errorMessage.set('Le paiement a été refusé ou a échoué.');
           });

           if (data.redirect_url && !/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
              window.open(data.redirect_url, '_blank');
           } else if (data.redirect_url) {
              window.location.href = data.redirect_url;
           }
        } else {
           this.selectedEventForPayment.set(null);
           const ticketData = data?.data ?? data ?? res;
           this.purchasedTicket.set(ticketData);
        }
      },
      error: (err) => {
        this.processingEventId.set(null);
        this.errorMessage.set(err.message || 'Erreur lors du paiement.');
      }
    });
  }

  closeModal(): void {
    this.purchasedTicket.set(null);
  }
}
