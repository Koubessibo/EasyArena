import { Component, Input } from '@angular/core';
import { NgClass, NgIf } from '@angular/common';
import { FcfaPipe } from '../../pipes/fcfa.pipe';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [NgClass, NgIf, FcfaPipe],
  template: `
    <div class="stat-card">
      <div class="stat-card__icon-wrap" [style.background]="iconBg">
        <span class="material-symbols-outlined filled stat-card__icon" [style.color]="iconColor">{{ icon }}</span>
      </div>
      <div class="stat-card__content">
        <p class="stat-card__label">{{ label }}</p>
        <p class="stat-card__value">{{ isCurrency ? (value | fcfa) : value.toLocaleString('fr-FR') }}</p>
      </div>
      <div class="stat-card__trend" *ngIf="trend !== null" [ngClass]="trend >= 0 ? 'trend--up' : 'trend--down'">
        <span class="material-symbols-outlined">{{ trend >= 0 ? 'trending_up' : 'trending_down' }}</span>
        {{ trend >= 0 ? '+' : '' }}{{ trend }}%
      </div>
    </div>
  `,
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: number = 0;
  @Input() icon = 'analytics';
  @Input() iconColor = 'var(--primary-green)';
  @Input() iconBg = 'var(--primary-green-muted)';
  @Input() isCurrency = false;
  @Input() trend: number | null = null;
}
