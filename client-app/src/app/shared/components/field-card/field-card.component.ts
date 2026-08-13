import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { Field, SportCategory } from '../../../core/models/field.model';
import { FcfaPipe } from '../../pipes/fcfa.pipe';

const SPORT_LABELS: Record<SportCategory, string> = {
  football: 'Football',
  basketball: 'Basketball',
  tennis: 'Tennis',
  padel: 'Padel',
  volleyball: 'Volleyball',
  handball: 'Handball',
};

const SURFACE_LABELS: Record<string, string> = {
  synthetic_turf: 'Synthétique',
  natural_grass: 'Gazon Naturel',
  hard_court: 'Surface Dure',
  clay: 'Terre Battue',
};

@Component({
  selector: 'app-field-card',
  standalone: true,
  imports: [RouterLink, NgIf, FcfaPipe],
  templateUrl: './field-card.component.html',
  styleUrl: './field-card.component.scss',
})
export class FieldCardComponent {
  @Input({ required: true }) field!: Field;
  @Input() variant: 'horizontal' | 'vertical' = 'vertical';
  @Input() isFavorite = false;
  @Output() favoriteToggled = new EventEmitter<string>();

  imgError = signal(false);

  onImageError(): void { this.imgError.set(true); }

  onFavoriteClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoriteToggled.emit(this.field.id);
  }

  getSportLabel(sport: SportCategory): string {
    return SPORT_LABELS[sport] ?? sport;
  }

  getSurfaceLabel(surface: string): string {
    return SURFACE_LABELS[surface] ?? 'Revêtement Pro';
  }
}
