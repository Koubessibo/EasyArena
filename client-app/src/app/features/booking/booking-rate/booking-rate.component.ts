import { Component, signal, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../../core/services/booking.service';
import { Booking } from '../../../core/models/booking.model';

@Component({
  selector: 'app-booking-rate',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
  templateUrl: './booking-rate.component.html',
  styleUrl: './booking-rate.component.scss',
})
export class BookingRateComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bookingService = inject(BookingService);

  booking = signal<Booking | null>(null);
  hoveredStar = signal(0);
  selectedStar = signal(0);
  comment = signal('');
  loading = signal(false);
  submitted = signal(false);

  readonly stars = [1, 2, 3, 4, 5];

  readonly ratingLabels: Record<number, string> = {
    1: 'Très mauvais',
    2: 'Mauvais',
    3: 'Correct',
    4: 'Bien',
    5: 'Excellent !',
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.bookingService.getBookingById(id).subscribe(b => {
      this.booking.set(b || null);
    });
  }

  hoverStar(star: number): void {
    this.hoveredStar.set(star);
  }

  leaveStar(): void {
    this.hoveredStar.set(0);
  }

  selectStar(star: number): void {
    this.selectedStar.set(star);
  }

  getStarClass(star: number): string {
    const active = this.hoveredStar() || this.selectedStar();
    return star <= active ? 'star--active' : 'star--inactive';
  }

  get canSubmit(): boolean {
    return this.selectedStar() > 0;
  }

  submitRating(): void {
    if (!this.canSubmit) return;
    this.loading.set(true);

    // Mock submit delay
    setTimeout(() => {
      this.loading.set(false);
      this.submitted.set(true);
      setTimeout(() => {
        this.router.navigate(['/booking/history']);
      }, 2000);
    }, 1000);
  }

  skip(): void {
    this.router.navigate(['/booking/history']);
  }
}
