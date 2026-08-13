import { Component, signal, inject, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { FieldService } from '../../core/services/field.service';
import { Field, SportCategory } from '../../core/models/field.model';
import { FieldCardComponent } from '../../shared/components/field-card/field-card.component';

type ViewMode = 'list' | 'map';
type PriceRange = 'under5k' | '5k-10k' | 'over10k' | '';
type DistanceRange = 'under1' | '1-5' | 'over5' | '';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [NgIf, NgFor, FieldCardComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnInit, AfterViewInit {
  private fieldService = inject(FieldService);
  private router = inject(Router);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  query = signal('');
  viewMode = signal<ViewMode>('list');
  loading = signal(false);
  allFields = signal<Field[]>([]);
  filteredFields = signal<Field[]>([]);

  // Filters
  activeSport = signal<SportCategory | ''>('');
  activePriceRange = signal<PriceRange>('');
  activeDistance = signal<DistanceRange>('');

  readonly sportFilters: { label: string; value: SportCategory }[] = [
    { label: 'Football', value: 'football' },
    { label: 'Basketball', value: 'basketball' },
    { label: 'Tennis', value: 'tennis' },
    { label: 'Padel', value: 'padel' },
  ];

  readonly priceFilters: { label: string; value: PriceRange }[] = [
    { label: 'Moins de 5 000', value: 'under5k' },
    { label: '5 000 – 10 000', value: '5k-10k' },
    { label: 'Plus de 10 000', value: 'over10k' },
  ];

  readonly distanceFilters: { label: string; value: DistanceRange }[] = [
    { label: '< 1 km', value: 'under1' },
    { label: '1 – 5 km', value: '1-5' },
    { label: '5 km+', value: 'over5' },
  ];

  get resultsCount(): number {
    return this.filteredFields().length;
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.fieldService.getFields().subscribe(fields => {
      this.allFields.set(fields);
      this.filteredFields.set(fields);
      this.loading.set(false);
    });
  }

  isFavorite(fieldId: string): boolean {
    return this.fieldService.isFavorite(fieldId);
  }

  toggleFavorite(fieldId: string): void {
    this.fieldService.toggleFavorite(fieldId);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.searchInputRef?.nativeElement.focus();
    }, 100);
  }

  onSearchInput(value: string): void {
    this.query.set(value);
    this.applyFilters();
  }

  clearSearch(): void {
    this.query.set('');
    this.applyFilters();
  }

  toggleSport(sport: SportCategory): void {
    this.activeSport.set(this.activeSport() === sport ? '' : sport);
    this.applyFilters();
  }

  togglePrice(price: PriceRange): void {
    this.activePriceRange.set(this.activePriceRange() === price ? '' : price);
    this.applyFilters();
  }

  toggleDistance(distance: DistanceRange): void {
    this.activeDistance.set(this.activeDistance() === distance ? '' : distance);
    this.applyFilters();
  }

  private applyFilters(): void {
    let results = this.allFields();
    const q = this.query().toLowerCase().trim();

    if (q) {
      results = results.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.district.toLowerCase().includes(q) ||
        f.sport.toLowerCase().includes(q)
      );
    }

    if (this.activeSport()) {
      results = results.filter(f => f.sport === this.activeSport());
    }

    const price = this.activePriceRange();
    if (price === 'under5k') {
      results = results.filter(f => f.pricePerHour < 5000);
    } else if (price === '5k-10k') {
      results = results.filter(f => f.pricePerHour >= 5000 && f.pricePerHour <= 10000);
    } else if (price === 'over10k') {
      results = results.filter(f => f.pricePerHour > 10000);
    }

    const dist = this.activeDistance();
    if (dist === 'under1') {
      results = results.filter(f => (f.distance || 0) < 1);
    } else if (dist === '1-5') {
      results = results.filter(f => (f.distance || 0) >= 1 && (f.distance || 0) <= 5);
    } else if (dist === 'over5') {
      results = results.filter(f => (f.distance || 0) > 5);
    }

    this.filteredFields.set(results);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  readonly skeletonItems = Array(3).fill(0);
}
