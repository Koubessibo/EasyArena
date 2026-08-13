import { Component, signal, computed, inject, OnInit, OnDestroy, Input } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { NgIf, NgFor, TitleCasePipe } from '@angular/common';
import { Subject, switchMap, takeUntil } from 'rxjs';
import { FieldService, AvailabilitySlot } from '../../../core/services/field.service';
import { BookingService } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';
import { Field } from '../../../core/models/field.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { AuthPromptComponent } from '../../../shared/components/auth-prompt/auth-prompt.component';

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

interface DayTab {
  date: string; // YYYY-MM-DD
  shortDay: string;
  dayNum: number;
  month: string;
}

@Component({
  selector: 'app-field-detail',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, TitleCasePipe, FcfaPipe, AuthPromptComponent],
  templateUrl: './field-detail.component.html',
  styleUrl: './field-detail.component.scss',
})
export class FieldDetailComponent implements OnInit, OnDestroy {
  @Input() id!: string;

  private fieldService = inject(FieldService);
  private bookingService = inject(BookingService);
  private authService = inject(AuthService);
  private router = inject(Router);

  private daySelect$ = new Subject<DayTab>();
  private destroy$ = new Subject<void>();

  showAuthPrompt = signal(false);
  field = signal<Field | undefined>(undefined);
  loading = signal(true);
  bookingLoading = signal(false);
  bookingError = signal<string | null>(null);
  activeImageIndex = signal(0);
  availabilitySlots = signal<AvailabilitySlot[]>([]);
  availabilityLoading = signal(false);
  availabilityError = signal(false);
  selectedDate = signal<DayTab | null>(null);
  selectedSlot = signal<AvailabilitySlot | null>(null);
  numSlots = signal(1);
  blockedDates = signal<Set<string>>(new Set());
  dayIsBlocked = signal(false);

  readonly dayTabs = signal<DayTab[]>([]);

  getSportIcon(sport: string): string {
    switch (sport?.toLowerCase()) {
      case 'basketball': return 'sports_basketball';
      case 'tennis': return 'sports_tennis';
      case 'padel': return 'sports_tennis';
      case 'volleyball': return 'sports_volleyball';
      case 'handball': return 'sports_handball';
      default: return 'sports_soccer';
    }
  }

  getSurfaceLabel(surface: string): string {
    switch (surface) {
      case 'synthetic_turf': return 'Gazon Synthétique High-Tech';
      case 'natural_grass': return 'Gazon Naturel Certifié';
      case 'parquet': return 'Parquet / Salle Couverte';
      case 'resin': return 'Résine Synthétique / Tartan';
      case 'hard_court': return 'Béton / Hard Court';
      case 'clay': return 'Terre Battue';
      case 'sand': return 'Sable / Beach Sport';
      default: return surface || 'Revêtement Qualité Pro';
    }
  }

  readonly slotDurationMin = computed(() => {
    const slot = this.selectedSlot();
    if (!slot) return 60;
    const diff = this.timeToMinutes(slot.slot_end) - this.timeToMinutes(slot.slot_start);
    return diff >= 0 ? diff : diff + 1440;
  });

  readonly selectedSlotRange = computed(() => {
    const slot = this.selectedSlot();
    const n = this.numSlots();
    const dur = this.slotDurationMin();
    if (!slot) return [];
    const starts: string[] = [];
    for (let i = 0; i < n; i++) {
      starts.push(this.addMinutes(slot.slot_start, i * dur));
    }
    return starts;
  });

  readonly rangeAvailable = computed(() => {
    const range = this.selectedSlotRange();
    const slots = this.availabilitySlots();
    return range.every(s => slots.find(sl => sl.slot_start === s)?.available ?? false);
  });

  readonly endTime = computed(() => {
    const slot = this.selectedSlot();
    if (!slot) return '';
    return this.addMinutes(slot.slot_start, this.slotDurationMin() * this.numSlots());
  });

  readonly totalPrice = computed(() => {
    const slot = this.selectedSlot();
    return slot ? slot.price * this.numSlots() : 0;
  });

  ngOnInit(): void {
    // Build 7-day tabs starting from today
    const tabs: DayTab[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      tabs.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        shortDay: DAY_NAMES[d.getDay()],
        dayNum: d.getDate(),
        month: MONTH_NAMES[d.getMonth()],
      });
    }
    this.dayTabs.set(tabs);

    // switchMap cancels any in-flight request when a new day is selected
    this.daySelect$.pipe(
      switchMap(day => {
        this.availabilityLoading.set(true);
        this.availabilityError.set(false);
        this.availabilitySlots.set([]);
        this.dayIsBlocked.set(false);
        return this.fieldService.getAvailability(this.id, day.date);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res) => {
        this.dayIsBlocked.set(res.day_blocked);
        this.availabilitySlots.set(res.slots);
        this.availabilityLoading.set(false);
      },
      error: () => {
        this.availabilitySlots.set([]);
        this.availabilityError.set(true);
        this.availabilityLoading.set(false);
      },
    });

    this.fieldService.getFieldById(this.id).subscribe(field => {
      this.field.set(field);
      this.loading.set(false);
      if (field && tabs.length) {
        this.selectDay(tabs[0]);
        // Load blocked dates for the 7-day window
        const dateFrom = tabs[0].date;
        const dateTo = tabs[tabs.length - 1].date;
        this.fieldService.getDayBlocks(this.id, dateFrom, dateTo).subscribe(blocks => {
          this.blockedDates.set(new Set(blocks.map(b => b.blocked_date)));
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  selectDay(day: DayTab): void {
    this.selectedDate.set(day);
    this.selectedSlot.set(null);
    this.numSlots.set(1);
    this.daySelect$.next(day);
  }

  selectSlot(slot: AvailabilitySlot): void {
    if (!slot.available) return;
    this.selectedSlot.set(slot);
    this.numSlots.set(1);
  }

  changeNumSlots(delta: number): void {
    const slots = this.availabilitySlots();
    const dur = this.slotDurationMin();
    const base = this.selectedSlot();
    if (!base) return;
    // Count consecutive available slots starting from the selected one
    let maxSlots = 0;
    for (let i = 0; i < 8; i++) {
      const nextStart = this.addMinutes(base.slot_start, i * dur);
      if (slots.find(s => s.slot_start === nextStart)?.available) {
        maxSlots++;
      } else {
        break;
      }
    }
    this.numSlots.set(Math.max(1, Math.min(maxSlots, this.numSlots() + delta)));
  }

  bookNow(): void {
    if (!this.authService.isAuthenticated()) {
      this.showAuthPrompt.set(true);
      return;
    }

    const f = this.field();
    const day = this.selectedDate();
    const slot = this.selectedSlot();

    if (!f || !day || !slot || !this.rangeAvailable() || this.dayIsBlocked() || slot.blocked) return;

    this.bookingLoading.set(true);
    this.bookingError.set(null);

    this.bookingService.createBooking({
      fieldId: f.id,
      date: day.date,
      scheduleId: slot.schedule_id,
      startTime: slot.slot_start,
      endTime: this.endTime(),
      numSlots: this.numSlots(),
    }).subscribe({
      next: (booking) => {
        this.router.navigate(['/booking/summary'], {
          queryParams: { bookingId: booking.id },
        });
      },
      error: (err) => {
        console.error('[BookNow]', err);
        this.bookingLoading.set(false);
        this.bookingError.set(err?.message ?? 'Une erreur est survenue lors de la réservation. Veuillez réessayer.');
      },
    });
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private addMinutes(time: string, minutes: number): string {
    const total = (this.timeToMinutes(time) + minutes) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  }

  share(): void {
    if (navigator.share) {
      navigator.share({
        title: this.field()?.name,
        url: window.location.href,
      });
    }
  }

  encodeURIComponent = encodeURIComponent;

  get amenitiesAvailable() {
    return this.field()?.amenities.filter(a => a.available) ?? [];
  }
}
