import { Component, Input, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { FieldOwnerService } from '../../../../core/services/field-owner.service';
import { ApiService } from '../../../../core/services/api.service';

interface SlotState {
  slot_start: string;
  slot_end: string;
  blocked: boolean;
  blockId: string | null;
}

@Component({
  selector: 'app-slot-blocker',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  templateUrl: './slot-blocker.component.html',
  styleUrl: './slot-blocker.component.scss',
})
export class SlotBlockerComponent {
  @Input() fieldId!: string;

  private svc = inject(FieldOwnerService);
  private api = inject(ApiService);

  date = signal('');
  slots = signal<SlotState[]>([]);
  slotsLoading = signal(false);
  error = signal<string | null>(null);

  loadSlots(): void {
    if (!this.date()) return;
    this.slotsLoading.set(true);
    this.slots.set([]);
    this.error.set(null);

    forkJoin({
      availability: this.api.get<any>(`/fields/${this.fieldId}/availability?date=${this.date()}`),
      blocks: this.svc.getSlotBlocks(this.fieldId, this.date()),
    }).subscribe({
      next: ({ availability, blocks }) => {
        const blockedMap = new Map((blocks as any[]).map((b: any) => [b.slot_start, b.id]));
        const allSlots: SlotState[] = [];
        for (const schedule of (availability.schedules ?? [])) {
          for (const s of (schedule.slots ?? [])) {
            allSlots.push({
              slot_start: s.slot_start,
              slot_end: s.slot_end,
              blocked: blockedMap.has(s.slot_start),
              blockId: blockedMap.get(s.slot_start) ?? null,
            });
          }
        }
        this.slots.set(allSlots);
        this.slotsLoading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.slotsLoading.set(false);
      },
    });
  }

  toggle(slot: SlotState): void {
    if (slot.blocked && slot.blockId) {
      this.svc.unblockSlot(this.fieldId, slot.blockId).subscribe({
        next: () => this.loadSlots(),
        error: (err: Error) => this.error.set(err.message),
      });
    } else if (!slot.blocked) {
      this.svc.blockSlot(this.fieldId, this.date(), slot.slot_start).subscribe({
        next: () => this.loadSlots(),
        error: (err: Error) => this.error.set(err.message),
      });
    }
  }
}
