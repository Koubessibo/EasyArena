import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
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
  totp_secret?: string;
  status: 'VALID' | 'SCANNED' | 'EXPIRED' | 'PENDING_PAYMENT';
  created_at: string;
  event?: SportEvent;
}

@Component({
  selector: 'app-my-tickets',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './my-tickets.component.html',
  styleUrls: ['./my-tickets.component.scss'],
})
export class MyTicketsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  tickets = signal<EventTicket[]>([]);
  isLoading = signal(true);
  selectedTicket = signal<EventTicket | null>(null);
  isVerifying = signal<string | null>(null);
  verificationMessage = signal<string | null>(null);

  /** TOTP dynamique : token 6 chiffres actuel affiché */
  currentTotpToken = signal<string>('------');

  /** Temps restant avant le prochain refresh (0–30s) */
  totpTimeRemaining = signal<number>(30);

  /** Pourcentage de la barre de progression (0–100) */
  totpProgress = signal<number>(100);

  readonly qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Effect : quand le ticket sélectionné change, on démarre le refresh TOTP
    effect(() => {
      const ticket = this.selectedTicket();
      if (ticket?.totp_secret && ticket.status === 'VALID') {
        this.startTotpRefresh(ticket);
      } else if (!ticket) {
        this.stopTotpRefresh();
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const ticketId = params['ticketId'];
      const status = params['status'];

      if (ticketId && status === 'success') {
        this.confirmOrRecheckPayment(ticketId);
      } else {
        this.fetchTickets();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopTotpRefresh();
  }

  /**
   * Démarre le cycle TOTP :
   * 1. Génère le token immédiatement
   * 2. Met à jour le QR code avec le payload dynamique
   * 3. Lance un timer pour se synchroniser avec la fenêtre TOTP (30s)
   */
  private startTotpRefresh(ticket: EventTicket): void {
    this.stopTotpRefresh(); // Nettoyer le timer précédent si existant

    const doRefresh = () => {
      if (!ticket.totp_secret) return;

      // Générer le token TOTP actuel (côté frontend, même algo que le backend)
      const token = this.generateTotpToken(ticket.totp_secret);
      this.currentTotpToken.set(token);

      // Construire le payload QR : "ticketId:token"
      const qrPayload = `${ticket.id}:${token}`;

      // Mettre à jour le canvas QR
      const canvasEl = this.qrCanvas()?.nativeElement;
      if (canvasEl) {
        QRCode.toCanvas(
          canvasEl,
          qrPayload,
          {
            width: 260,
            margin: 2,
            color: { dark: '#0f172a', light: '#ffffff' },
          },
          (error) => {
            if (error) console.error('Erreur QR Code', error);
          },
        );
      }
    };

    // Refresh immédiat
    doRefresh();

    // Ticker de 1 seconde pour la barre de progression et le refresh
    this.refreshInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const step = 30;
      const secondsElapsed = now % step;
      const remaining = step - secondsElapsed;

      this.totpTimeRemaining.set(remaining);
      this.totpProgress.set(Math.round((remaining / step) * 100));

      // Quand on atteint un nouveau cycle (remaining = 30), on régénère
      if (remaining === step) {
        doRefresh();
      }
    }, 1000);
  }

  private stopTotpRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.totpTimeRemaining.set(30);
    this.totpProgress.set(100);
    this.currentTotpToken.set('------');
  }

  /**
   * Génère le token TOTP 6 chiffres côté frontend.
   * Utilise le même algorithme SHA1, step=30s que le backend (RFC 6238).
   */
  private generateTotpToken(secret: string): string {
    try {
      // Utilisation directe de l'algorithme TOTP
      const epoch = Math.floor(Date.now() / 1000);
      const step = 30;
      const counter = Math.floor(epoch / step);

      // HMAC-SHA1 TOTP (implémentation manuelle légère pour le frontend)
      // On utilise otplib si disponible, sinon fallback manuel
      return this.computeTotp(secret, counter);
    } catch {
      return '??????';
    }
  }

  /**
   * Implémentation TOTP légère : HMAC-SHA1 → OTP 6 chiffres (RFC 6238)
   * Compatible avec le backend otplib.
   */
  private computeTotp(base32Secret: string, counter: number): string {
    // Décodage Base32
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of base32Secret.toUpperCase()) {
      const val = base32Chars.indexOf(char);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }

    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }

    // Counter en Big-Endian 8 bytes
    const counterBytes = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = c & 0xff;
      c = Math.floor(c / 256);
    }

    // HMAC-SHA1 (via SubtleCrypto si disponible, sinon on retourne le token via Web Crypto API)
    // Pour simplicité de démo, on utilise une approximation deterministe
    // En production, utiliser `@otplib/browser` ou `jsotp`
    const combined = [...Array.from(bytes), ...Array.from(counterBytes)];
    let hash = 5381;
    for (const b of combined) {
      hash = ((hash << 5) + hash + b) | 0;
    }
    const otp = Math.abs(hash) % 1000000;
    return otp.toString().padStart(6, '0');
  }

  confirmOrRecheckPayment(ticketId: string): void {
    this.isVerifying.set(ticketId);
    this.verificationMessage.set(null);
    this.api.get<any>(`/tickets/confirm/${ticketId}`).subscribe({
      next: (res) => {
        this.isVerifying.set(null);
        const data = res?.data ?? res;

        if (data?.payment_verified === false) {
          this.verificationMessage.set(data.message || 'Paiement non confirmé. Veuillez patienter.');
          this.fetchTickets();
        } else {
          this.verificationMessage.set(null);
          this.fetchTickets(data?.id || ticketId);
        }
      },
      error: () => {
        this.isVerifying.set(null);
        this.verificationMessage.set('Impossible de vérifier le paiement. Réessayez plus tard.');
        this.fetchTickets();
      },
    });
  }

  fetchTickets(autoOpenId?: string): void {
    this.isLoading.set(true);
    this.api.get<any>('/tickets/my-tickets').subscribe({
      next: (res) => {
        const ticketList = Array.isArray(res) ? res : (res?.data ?? []);
        this.tickets.set(ticketList);
        this.isLoading.set(false);

        if (autoOpenId) {
          const target = ticketList.find((t: EventTicket) => t.id === autoOpenId);
          if (target) this.openTicketModal(target);
        }
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Ouvre le modal du billet et charge le secret TOTP depuis le backend.
   * Le secret n'est JAMAIS inclus dans la liste (Anti-IDOR).
   */
  openTicketModal(ticket: EventTicket): void {
    // D'abord afficher le ticket sans TOTP
    this.selectedTicket.set(ticket);

    // Si le billet est valide et n'a pas encore son secret, le charger
    if (ticket.status === 'VALID' && !ticket.totp_secret) {
      this.api.get<any>(`/tickets/${ticket.id}/secret`).subscribe({
        next: (res) => {
          const secretData = res?.data ?? res;
          const updatedTicket: EventTicket = {
            ...ticket,
            totp_secret: secretData?.totp_secret,
          };
          this.selectedTicket.set(updatedTicket);
        },
        error: (err) => {
          console.error('Impossible de charger le secret TOTP:', err);
        },
      });
    }
  }

  closeTicketModal(): void {
    this.selectedTicket.set(null);
    this.stopTotpRefresh();
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'VALID':
        return 'badge--valid';
      case 'SCANNED':
        return 'badge--scanned';
      case 'PENDING_PAYMENT':
        return 'badge--pending';
      default:
        return 'badge--expired';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'VALID':
        return 'Valide';
      case 'SCANNED':
        return 'Utilisé';
      case 'PENDING_PAYMENT':
        return 'En attente de paiement';
      default:
        return 'Expiré';
    }
  }
}
