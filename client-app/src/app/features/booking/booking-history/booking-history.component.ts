import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { BookingService } from '../../../core/services/booking.service';
import { Booking, BookingStatus } from '../../../core/models/booking.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

type HistoryTab = 'upcoming' | 'past';

@Component({
  selector: 'app-booking-history',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, NgClass, FcfaPipe],
  templateUrl: './booking-history.component.html',
  styleUrl: './booking-history.component.scss',
})
export class BookingHistoryComponent implements OnInit {
  private bookingService = inject(BookingService);
  private router = inject(Router);

  activeTab = signal<HistoryTab>('upcoming');
  upcomingBookings = signal<Booking[]>([]);
  pastBookings = signal<Booking[]>([]);
  loading = signal(true);
  brokenImages = new Set<string>();

  onImageError(id: string): void {
    this.brokenImages = new Set([...this.brokenImages, id]);
  }

  get currentBookings(): Booking[] {
    return this.activeTab() === 'upcoming' ? this.upcomingBookings() : this.pastBookings();
  }

  ngOnInit(): void {
    this.bookingService.getUpcomingBookings().subscribe(bookings => {
      this.upcomingBookings.set(bookings);
    });

    this.bookingService.getPastBookings().subscribe(bookings => {
      this.pastBookings.set(bookings);
      this.loading.set(false);
    });
  }

  switchTab(tab: HistoryTab): void {
    this.activeTab.set(tab);
  }

  getStatusLabel(status: BookingStatus): string {
    const labels: Record<BookingStatus, string> = {
      pending: 'En attente',
      confirmed: 'Confirmé',
      cancelled: 'Annulé',
      completed: 'Terminé',
      no_show: 'Absent',
    };
    return labels[status];
  }

  getStatusClass(status: BookingStatus): string {
    const classes: Record<BookingStatus, string> = {
      pending: 'badge--warning',
      confirmed: 'badge--success',
      cancelled: 'badge--error',
      completed: 'badge--neutral',
      no_show: 'badge--error',
    };
    return classes[status];
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  cancelBooking(booking: Booking): void {
    this.router.navigate(['/booking', booking.id]);
  }
}
