import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../../core/services/field-owner.service';

@Component({
  selector: 'app-schedule-editor',
  standalone: true,
  imports: [NgIf, FormsModule],
  templateUrl: './schedule-editor.component.html',
  styleUrl: './schedule-editor.component.scss',
})
export class ScheduleEditorComponent implements OnInit {
  @Input() fieldId!: string;

  private svc = inject(FieldOwnerService);

  openAt = signal('08:00');
  closeAt = signal('22:00');
  slotDuration = signal(60);
  pricePerSlot = signal(0);
  depositPerSlot = signal<number | null>(null);

  loading = signal(false);
  success = signal(false);
  error = signal<string | null>(null);

  readonly durations = [30, 60, 90, 120];

  ngOnInit(): void {
    this.svc.getSchedule(this.fieldId).subscribe({
      next: (s: any) => {
        if (s) {
          this.openAt.set(s.open_at ?? '08:00');
          this.closeAt.set(s.close_at ?? '22:00');
          this.slotDuration.set(Number(s.slot_duration_min ?? 60));
          this.pricePerSlot.set(Number(s.price_per_slot ?? 0));
          this.depositPerSlot.set(s.deposit_per_slot != null ? Number(s.deposit_per_slot) : null);
        }
      },
    });
  }

  save(): void {
    this.loading.set(true);
    this.success.set(false);
    this.error.set(null);

    const dto = {
      open_at: this.openAt(),
      close_at: this.closeAt(),
      slot_duration_min: this.slotDuration(),
      price_per_slot: this.pricePerSlot(),
      deposit_per_slot: this.depositPerSlot() || null,
    };

    this.svc.createSchedule(this.fieldId, dto).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        setTimeout(() => this.success.set(false), 3000);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }
}
