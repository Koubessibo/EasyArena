import { Component, inject, OnInit, signal, viewChild, ElementRef, effect } from '@angular/core';
import { NgIf, NgFor, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { WebSocketService } from '../../core/services/websocket.service';
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
  selector: 'app-events',
  standalone: true,
  imports: [NgIf, NgFor, DecimalPipe, DatePipe, FormsModule],
  templateUrl: './events.component.html',
  styleUrl: './events.component.scss'
})
export class EventsComponent implements OnInit {
  private api = inject(ApiService);
  private wsService = inject(WebSocketService);
  private router = inject(Router);

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
        const list = Array.isArray(res) ? res : (res.data ?? []);
        this.events.set(list);
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
        const ticketId = data?.id || data?.ticketId;

        if (data?.status === 'PENDING_PAYMENT' || ticketId) {
           this.isAwaitingPayment.set(true);
           this.paymentGatewayUrls.set({ redirect_url: data.redirect_url, urls: data.urls });
           this.pendingTicketId.set(ticketId);

           this.wsService.connect();
           this.wsService.joinBooking(ticketId);
           
           const wsSub = this.wsService.onPaymentConfirmed().subscribe(() => {
              this.wsService.disconnect();
              wsSub.unsubscribe();
              this.isAwaitingPayment.set(false);
              this.selectedEventForPayment.set(null);
              this.router.navigate(['/my-tickets'], { queryParams: { status: 'success', ticketId } });
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

  checkAndConfirmTicketPayment(): void {
    const id = this.pendingTicketId();
    this.wsService.disconnect();

    if (!id) {
      this.isAwaitingPayment.set(false);
      this.selectedEventForPayment.set(null);
      this.router.navigate(['/my-tickets']);
      return;
    }

    this.processingEventId.set('verifying');
    this.errorMessage.set(null);

    this.api.get<any>(`/tickets/confirm/${id}`).subscribe({
      next: (res) => {
        const data = res?.data ?? res;
        this.processingEventId.set(null);
        this.isAwaitingPayment.set(false);
        this.selectedEventForPayment.set(null);

        if (data?.payment_verified === false) {
          this.errorMessage.set(data.message || 'Le paiement n\'a pas encore été confirmé. Veuillez patienter.');
        } else if (data?.status === 'VALID' || data?.status === 'SCANNED') {
          this.router.navigate(['/my-tickets'], { queryParams: { status: 'success', ticketId: id } });
        } else {
          this.errorMessage.set('Le paiement n\'a pas encore été confirmé par votre opérateur. Veuillez patienter ou réessayer.');
        }
      },
      error: () => {
        this.processingEventId.set(null);
        this.isAwaitingPayment.set(false);
        this.selectedEventForPayment.set(null);
        this.errorMessage.set('Impossible de vérifier le paiement. Vérifiez dans "Mes Billets".');
      },
    });
  }

  closeModal(): void {
    this.purchasedTicket.set(null);
  }
}
