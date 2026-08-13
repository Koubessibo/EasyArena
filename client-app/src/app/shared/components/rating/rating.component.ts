import { Component, Input } from '@angular/core';
import { NgIf, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-rating',
  standalone: true,
  imports: [NgIf, DecimalPipe],
  template: `
    <div class="rating">
      <span class="material-symbols-outlined star-icon filled">star</span>
      <span class="rating-value">{{ value | number: '1.1-1' }}</span>
      <span *ngIf="count !== undefined" class="rating-count">({{ count }})</span>
    </div>
  `,
  styles: [`
    .rating {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }

    .star-icon {
      font-size: 1rem;
      color: #f59e0b;
      line-height: 1;
    }

    .rating-value {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      line-height: 1;
    }

    .rating-count {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      line-height: 1;
    }
  `],
})
export class RatingComponent {
  @Input({ required: true }) value!: number;
  @Input() count?: number;
}
