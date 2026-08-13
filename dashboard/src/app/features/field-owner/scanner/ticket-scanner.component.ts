import {
  Component,
  signal,
  viewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  inject,
  NgZone,
} from '@angular/core';
import { NgIf, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import jsQR from 'jsqr';
import { ApiService } from '../../../core/services/api.service';

type ScannerState = 'idle' | 'scanning' | 'success' | 'error';

interface ValidateTicketResponse {
  ticketId: string;
  holderName: string;
  eventName: string;
  validatedAt: string;
}

@Component({
  selector: 'app-ticket-scanner',
  standalone: true,
  imports: [NgIf, NgClass, RouterLink, FormsModule],
  templateUrl: './ticket-scanner.component.html',
  styleUrl: './ticket-scanner.component.scss',
})
export class TicketScannerComponent implements OnInit, OnDestroy {
  private api   = inject(ApiService);
  private zone  = inject(NgZone);

  // ── Signals ────────────────────────────────────────────────────────────────
  scannerState   = signal<ScannerState>('idle');
  feedbackMessage = signal<string | null>(null);
  validatedTicket = signal<ValidateTicketResponse | null>(null);
  cameraError    = signal<string | null>(null);
  isCameraActive = signal(false);

  // ── Refs caméra / canvas ───────────────────────────────────────────────────
  readonly videoRef  = viewChild<ElementRef<HTMLVideoElement>>('cameraStream');
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  private mediaStream: MediaStream | null = null;
  private rafId: number | null = null;       // requestAnimationFrame handle
  private isValidating = false;              // verrou anti-double appel

  // ── Saisie manuelle (fallback) ─────────────────────────────────────────────
  manualToken = '';

  // ──────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.startCamera();
  }

  ngOnDestroy(): void {
    this.stopScanLoop();
    this.stopCamera();
  }

  // ── Caméra ────────────────────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    this.cameraError.set(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.mediaStream = stream;
      const video = this.videoRef()?.nativeElement;
      if (video) {
        video.srcObject = stream;
        await video.play();
        this.isCameraActive.set(true);
        // Démarre la boucle de décodage QR dès que la vidéo joue
        video.addEventListener('playing', () => this.startScanLoop(), { once: true });
      }
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Accès à la caméra refusé. Veuillez autoriser la caméra dans les paramètres.'
          : "Impossible d'accéder à la caméra. Vérifiez que votre appareil en dispose.";
      this.cameraError.set(message);
    }
  }

  private stopCamera(): void {
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.mediaStream = null;
    this.isCameraActive.set(false);
  }

  // ── Boucle de scan QR (jsQR) ──────────────────────────────────────────────

  private startScanLoop(): void {
    const tick = () => {
      this.decodeFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopScanLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private decodeFrame(): void {
    // Ne rien faire si une validation est en cours ou si on est en success/error
    if (this.isValidating) return;
    const state = this.scannerState();
    if (state === 'success' || state === 'error') return;

    const video  = this.videoRef()?.nativeElement;
    const canvas = this.canvasRef()?.nativeElement;
    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code?.data) {
      // Décodage réussi — on exécute validateTicket dans la zone Angular
      this.zone.run(() => this.validateTicket(code.data));
    }
  }

  // ── Validation du ticket via l'API ────────────────────────────────────────

  validateTicket(qrToken: string): void {
    const token = qrToken.trim();
    if (!token || this.isValidating) return;

    this.isValidating = true;
    this.stopScanLoop();           // Pause de la boucle pendant la requête
    this.scannerState.set('scanning');
    this.feedbackMessage.set(null);
    this.validatedTicket.set(null);

    this.api.post<ValidateTicketResponse>('/tickets/validate', { token }).subscribe({
      next: (data) => {
        this.playSound('success');
        this.validatedTicket.set(data);
        this.scannerState.set('success');
        this.feedbackMessage.set(
          `✓ Billet valide — ${data.holderName ?? 'Porteur inconnu'}`
        );
        setTimeout(() => this.onReset(), 4000);
      },
      error: (err: Error) => {
        this.playSound('error');
        this.scannerState.set('error');
        const raw = err.message?.toLowerCase() ?? '';

        if (raw.includes('used') || raw.includes('utilisé') || raw.includes('already')) {
          this.feedbackMessage.set('Billet déjà utilisé.');
        } else if (raw.includes('not found') || raw.includes('invalid') || raw.includes('invalide')) {
          this.feedbackMessage.set('Billet invalide ou introuvable.');
        } else if (raw.includes('expired') || raw.includes('expiré')) {
          this.feedbackMessage.set('Ce billet est expiré.');
        } else {
          this.feedbackMessage.set(err.message ?? 'Erreur lors de la validation.');
        }
        setTimeout(() => this.onReset(), 4000);
      },
    });
  }

  private playSound(type: 'success' | 'error'): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {
      // Ignore audio policy restrictions
    }
  }

  // ── Saisie manuelle (fallback) ────────────────────────────────────────────

  onManualSubmit(): void {
    const token = this.manualToken.trim();
    if (token) {
      this.validateTicket(token);
      this.manualToken = '';
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  onReset(): void {
    this.isValidating = false;
    this.scannerState.set('idle');
    this.feedbackMessage.set(null);
    this.validatedTicket.set(null);
    // Redémarre la boucle de scan
    if (this.isCameraActive()) {
      this.startScanLoop();
    }
  }
}
