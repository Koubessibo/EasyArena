import { Component, signal, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIf, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../../core/services/booking.service';
import { ReceiptPdfService } from '../../../core/services/receipt-pdf.service';
import { Booking, BookingStatus } from '../../../core/models/booking.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

@Component({
  selector: 'app-booking-detail',
  standalone: true,
  imports: [RouterLink, NgIf, NgClass, FcfaPipe, FormsModule],
  templateUrl: './booking-detail.component.html',
  styleUrl: './booking-detail.component.scss',
})
export class BookingDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bookingService = inject(BookingService);
  private receiptPdf = inject(ReceiptPdfService);

  booking = signal<Booking | null>(null);
  loading = signal(true);
  errorMessage = signal('');

  // Cancellation request state
  showCancelForm = signal(false);
  cancelReason = signal('');
  cancelSubmitting = signal(false);
  cancellationRequest = signal<any>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.bookingService.getBookingById(id).subscribe(b => {
      this.booking.set(b || null);
      this.loading.set(false);
      if (b && b.status === 'confirmed') {
        this.loadCancellationRequest(b.id);
      }
    });
  }

  private loadCancellationRequest(bookingId: string): void {
    this.bookingService.getCancellationRequest(bookingId).subscribe({
      next: (req) => this.cancellationRequest.set(req || null),
      error: () => {},
    });
  }

  goBack(): void {
    this.router.navigate(['/booking/history']);
  }

  share(): void {
    if (navigator.share) {
      navigator.share({
        title: 'Ma réservation EasyArena',
        text: `Réservation au ${this.booking()?.fieldName}`,
      });
    }
  }

  openCancelForm(): void {
    this.showCancelForm.set(true);
    this.cancelReason.set('');
    this.errorMessage.set('');
  }

  closeCancelForm(): void {
    this.showCancelForm.set(false);
  }

  submitCancellationRequest(): void {
    const b = this.booking();
    if (!b) return;

    this.cancelSubmitting.set(true);
    this.errorMessage.set('');

    this.bookingService.requestCancellation(b.id, this.cancelReason() || undefined).subscribe({
      next: (req) => {
        this.cancellationRequest.set(req);
        this.showCancelForm.set(false);
        this.cancelSubmitting.set(false);
      },
      error: (err: any) => {
        this.errorMessage.set(err?.error?.message ?? 'Impossible d\'envoyer la demande d\'annulation.');
        this.cancelSubmitting.set(false);
      },
    });
  }

  downloadReceipt(): void {
    const b = this.booking();
    if (b) this.receiptPdf.generateReceipt(b);
  }

  rebookField(): void {
    const b = this.booking();
    if (b) {
      this.router.navigate(['/fields', b.fieldId]);
    }
  }

  getStatusLabel(status: BookingStatus): string {
    const labels: Record<BookingStatus, string> = {
      pending: 'EN ATTENTE',
      confirmed: 'CONFIRMÉ',
      cancelled: 'ANNULÉ',
      completed: 'TERMINÉ',
      no_show: 'ABSENT',
    };
    return labels[status] || status;
  }

  getStatusClass(status: BookingStatus): string {
    const classes: Record<BookingStatus, string> = {
      pending: 'status-badge--warning',
      confirmed: 'status-badge--success',
      cancelled: 'status-badge--error',
      completed: 'status-badge--neutral',
      no_show: 'status-badge--error',
    };
    return classes[status] || '';
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

  getDurationHours(booking: Booking): number {
    return booking.pricing.durationHours;
  }

  shareWhatsApp(): void {
    const b = this.booking();
    if (!b) return;
    const msg = `Réservation EasyArena\nTerrain : ${b.fieldName}\nDate : ${this.formatDate(b.date)}\nHoraire : ${b.startTime} - ${b.endTime}\nMontant : ${b.pricing.total} FCFA`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
