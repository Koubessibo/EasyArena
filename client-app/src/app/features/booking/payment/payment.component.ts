import { Component, signal, inject, OnInit, OnDestroy, NgZone, DestroyRef } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import QRCode from 'qrcode';
import { BookingService } from '../../../core/services/booking.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { Booking, MobileOperator, PaymentInitiateResponse, PaymentMethod } from '../../../core/models/booking.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

interface PaymentOption {
  value: PaymentMethod;
  label: string;
  description: string;
  icon: string;
  color: string;
  requiresPhone: boolean;
  operator?: MobileOperator;
  supported: boolean;
}

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, FormsModule, FcfaPipe],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.scss',
})
export class PaymentComponent implements OnInit, OnDestroy {
  private bookingService = inject(BookingService);
  private wsService = inject(WebSocketService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private ngZone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  booking = signal<Booking | null>(null);
  pageLoading = signal(true);
  selectedMethod = signal<PaymentMethod>('orange_money');
  phoneNumber = signal('+221');
  loading = signal(false);
  errorMessage = signal('');
  paidAmount = signal<number | null>(null);

  // Gateway state
  viewState = signal<'selection' | 'gateway'>('selection');
  paymentResponse = signal<PaymentInitiateResponse | null>(null);
  qrCodeDataUrl = signal<string | null>(null);

  readonly paymentOptions: PaymentOption[] = [
    {
      value: 'wave',
      label: 'Wave',
      description: 'Paiement rapide via Wave',
      icon: 'waves',
      color: '#1DC4F5',
      requiresPhone: false,
      operator: 'WAVE',
      supported: true,
    },
    {
      value: 'orange_money',
      label: 'Orange Money',
      description: 'Paiement via Orange Money',
      icon: 'phone_android',
      color: '#FF6600',
      requiresPhone: false,
      operator: 'ORANGE_MONEY',
      supported: true,
    },
  ];

  get selectedOption(): PaymentOption {
    return this.paymentOptions.find(o => o.value === this.selectedMethod())!;
  }

  isMobile(): boolean {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  ngOnInit(): void {
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId');
    const paidAmountParam = this.route.snapshot.queryParamMap.get('paidAmount');
    if (paidAmountParam) this.paidAmount.set(Number(paidAmountParam));

    if (!bookingId) { this.pageLoading.set(false); return; }

    const found = this.bookingService.bookings().find(b => b.id === bookingId);
    if (found) {
      this.booking.set(found);
      this.pageLoading.set(false);
    } else {
      this.bookingService.getBookingById(bookingId).subscribe({
        next: (b) => { this.booking.set(b ?? null); this.pageLoading.set(false); },
        error: () => this.pageLoading.set(false),
      });
    }
  }

  ngOnDestroy(): void {
    this.wsService.disconnect();
  }

  selectMethod(method: PaymentMethod): void {
    const option = this.paymentOptions.find(o => o.value === method)!;
    if (!option.supported) {
      this.errorMessage.set('Cette méthode de paiement n\'est pas encore disponible.');
      return;
    }
    this.selectedMethod.set(method);
    this.errorMessage.set('');
  }

  processPayment(): void {
    const b = this.booking();
    const option = this.selectedOption;

    if (!b) return;

    if (!option.supported) {
      this.errorMessage.set('Cette méthode de paiement n\'est pas encore disponible.');
      return;
    }

    if (option.requiresPhone && this.phoneNumber().length < 10) {
      this.errorMessage.set('Veuillez entrer un numéro de téléphone valide.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const bookingId = b.id;
    const paidAmount = this.paidAmount();
    this.bookingService.processPayment({
      bookingId,
      method: this.selectedMethod(),
      operator: option.operator,
      phoneNumber: option.requiresPhone ? this.phoneNumber() : undefined,
      ...(paidAmount !== null ? { paidAmount } : {}),
    }).subscribe({
      next: async (res: PaymentInitiateResponse) => {
        this.loading.set(false);
        sessionStorage.setItem('pendingBookingId', bookingId);
        this.paymentResponse.set(res);

        if (!res.redirect_url && !res.urls) {
          // Dev mode: no real payment URL, navigate directly
          sessionStorage.removeItem('pendingBookingId');
          this.router.navigate(['/booking/confirmation'], { queryParams: { bookingId } });
          return;
        }

        if (this.selectedMethod() === 'wave') {
          if (this.isMobile()) {
            window.location.href = res.redirect_url!;
          } else {
            await this.generateQR(res.redirect_url!);
            this.viewState.set('gateway');
            this.connectWS(bookingId);
          }
        } else {
          // Orange Money — show gateway (buttons or QR)
          this.viewState.set('gateway');
          this.connectWS(bookingId);
        }
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/booking/payment-failed'], { queryParams: { code: 'declined' } });
      },
    });
  }

  private connectWS(bookingId: string): void {
    this.wsService.connect();
    this.wsService.joinBooking(bookingId);

    this.wsService.onPaymentConfirmed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.ngZone.run(() => {
        sessionStorage.removeItem('pendingBookingId');
        this.router.navigate(['/booking/confirmation'], { queryParams: { bookingId } });
      }));

    this.wsService.onPaymentFailed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.ngZone.run(() => {
        this.router.navigate(['/booking/payment-failed'], { queryParams: { code: 'declined' } });
      }));
  }

  private async generateQR(url: string): Promise<void> {
    const dataUrl = await QRCode.toDataURL(url, { width: 250, margin: 2 });
    this.qrCodeDataUrl.set(dataUrl);
  }

  openPaymentLink(url: string): void {
    window.open(url, '_blank');
  }

  backToSelection(): void {
    this.wsService.disconnect();
    this.viewState.set('selection');
    this.paymentResponse.set(null);
    this.qrCodeDataUrl.set(null);
  }
}
