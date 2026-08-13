import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../../core/services/booking.service';
import { Booking } from '../../../core/models/booking.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

@Component({
  selector: 'app-booking-summary',
  standalone: true,
  imports: [RouterLink, NgIf, FormsModule, FcfaPipe],
  templateUrl: './booking-summary.component.html',
  styleUrl: './booking-summary.component.scss',
})
export class BookingSummaryComponent implements OnInit {
  private bookingService = inject(BookingService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  booking = signal<Booking | null>(null);
  loading = signal(true);
  paymentChoice = signal<'full' | 'deposit'>('full');
  depositInput = signal(0);

  ngOnInit(): void {
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId');

    // Try the signal first (freshly created booking from field-detail)
    const pending = this.bookingService.pendingBooking();
    if (pending?.id === bookingId || (!bookingId && pending)) {
      this.booking.set(pending as Booking);
      this.loading.set(false);
      return;
    }

    if (bookingId) {
      this.bookingService.getBookingById(bookingId).subscribe({
        next: (b) => { this.booking.set(b ?? null); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    } else {
      this.loading.set(false);
    }
  }

  get formattedDate(): string {
    const b = this.booking();
    if (!b) return '';
    const date = new Date(b.date);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  get minDeposit(): number | null {
    return this.booking()?.pricing.minDepositAmount ?? null;
  }

  get totalAmount(): number {
    return this.booking()?.pricing.total ?? 0;
  }

  get chosenAmount(): number {
    return this.paymentChoice() === 'deposit' ? this.depositInput() : this.totalAmount;
  }

  get depositValid(): boolean {
    if (this.paymentChoice() === 'full') return true;
    const min = this.minDeposit;
    return min !== null && this.depositInput() >= min;
  }

  confirmBooking(): void {
    const b = this.booking();
    if (!b) return;
    const params: Record<string, string> = { bookingId: b.id };
    if (this.paymentChoice() === 'deposit') {
      params['paidAmount'] = String(this.depositInput());
    }
    this.router.navigate(['/booking/payment'], { queryParams: params });
  }
}
