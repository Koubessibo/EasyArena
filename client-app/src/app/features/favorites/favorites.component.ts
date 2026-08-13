import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { FieldService } from '../../core/services/field.service';
import { Field } from '../../core/models/field.model';
import { FieldCardComponent } from '../../shared/components/field-card/field-card.component';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, FieldCardComponent],
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.scss',
})
export class FavoritesComponent implements OnInit {
  private fieldService = inject(FieldService);

  loading = signal(true);
  favoriteFields = signal<Field[]>([]);

  ngOnInit(): void {
    const favoriteIds = this.fieldService.favorites();
    if (!favoriteIds.length) {
      this.loading.set(false);
      return;
    }
    this.fieldService.getFields().subscribe({
      next: (fields) => {
        this.favoriteFields.set(fields.filter(f => favoriteIds.includes(f.id)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleFavorite(fieldId: string): void {
    this.fieldService.toggleFavorite(fieldId);
    this.favoriteFields.update(list => list.filter(f => f.id !== fieldId));
  }
}
