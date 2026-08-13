import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { NgIf } from '@angular/common';
import { BookingService } from '../../../core/services/booking.service';
import { ReceiptPdfService } from '../../../core/services/receipt-pdf.service';
import { Booking } from '../../../core/models/booking.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

@Component({
  selector: 'app-booking-confirmation',
  standalone: true,
  imports: [RouterLink, NgIf, FcfaPipe],
  templateUrl: './booking-confirmation.component.html',
  styleUrl: './booking-confirmation.component.scss',
})
export class BookingConfirmationComponent implements OnInit {
  private bookingService = inject(BookingService);
  private receiptPdf = inject(ReceiptPdfService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  booking = signal<Booking | null>(null);
  paymentFailed = signal(false);

  // Fallback mock data for demonstration
  readonly mockBooking = {
    fieldName: 'Green Valley Stadium',
    sport: 'Football',
    sportIcon: 'sports_soccer',
    date: 'Lundi 12 Juin 2025',
    startTime: '08:00',
    endTime: '09:00',
    reference: '#BK-2025-0847',
    total: 27500,
  };

  ngOnInit(): void {
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId')
      ?? sessionStorage.getItem('pendingBookingId')
      ?? this.bookingService.pendingBooking()?.id;

    sessionStorage.removeItem('pendingBookingId');

    if (!bookingId) return;

    this.bookingService.getBookingById(bookingId).subscribe({
      next: (b) => {
        if (b) this.booking.set(b);
        this.paymentFailed.set(b?.status === 'cancelled');
      },
    });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  downloadTicket(): void {
    const b = this.booking();
    if (b) {
      this.receiptPdf.generateReceipt(b);
    }
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  retryPayment(): void {
    const b = this.booking();
    if (b) {
      this.router.navigate(['/booking/payment'], { queryParams: { bookingId: b.id } });
    }
  }

  shareWhatsApp(): void {
    const b = this.booking();
    if (!b) return;
    const msg = `Réservation confirmée sur EasyArena !\nTerrain : ${b.fieldName}\nDate : ${this.formatDate(b.date)}\nHoraire : ${b.startTime} - ${b.endTime}\nMontant : ${b.pricing.total} FCFA`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
