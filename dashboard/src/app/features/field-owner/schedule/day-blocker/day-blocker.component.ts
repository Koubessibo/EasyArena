import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../../core/services/field-owner.service';

@Component({
  selector: 'app-day-blocker',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  templateUrl: './day-blocker.component.html',
  styleUrl: './day-blocker.component.scss',
})
export class DayBlockerComponent implements OnInit {
  @Input() fieldId!: string;

  private svc = inject(FieldOwnerService);

  blocks = signal<any[]>([]);
  date = signal('');
  note = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadBlocks();
  }

  private loadBlocks(): void {
    const today = new Date().toISOString().split('T')[0];
    this.svc.getDayBlocks(this.fieldId, today).subscribe({
      next: (list) => this.blocks.set(list),
    });
  }

  block(): void {
    if (!this.date()) return;
    this.loading.set(true);
    this.error.set(null);
    this.svc.blockDay(this.fieldId, this.date(), this.note() || undefined).subscribe({
      next: () => {
        this.date.set('');
        this.note.set('');
        this.loading.set(false);
        this.loadBlocks();
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  unblock(blockId: string): void {
    this.svc.unblockDay(this.fieldId, blockId).subscribe({
      next: () => this.loadBlocks(),
    });
  }
}
