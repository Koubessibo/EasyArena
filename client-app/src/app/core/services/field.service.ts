import { Injectable, signal, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { Field, SportCategory } from '../models/field.model';

const FAVORITES_KEY = 'xeweul_favorites';

export interface AvailabilitySlot {
  schedule_id: string;
  slot_start: string;
  slot_end: string;
  available: boolean;
  blocked: boolean;
  price: number;
  deposit_per_slot?: number | null;
}

export interface AvailabilityResult {
  date: string;
  field_id: string;
  day_blocked: boolean;
  slots: AvailabilitySlot[];
}

function mapApiField(f: any): Field {
  return {
    id: f.id,
    name: f.name,
    description: f.description ?? '',
    sport: (f.sport_type ?? 'football') as SportCategory,
    address: f.address ?? '',
    city: f.address ?? '',
    district: '',
    contactPhone: f.contact_phone ?? f.owner?.user?.phone ?? '',
    contactEmail: f.contact_email ?? f.owner?.user?.email ?? '',
    googleMapsUrl: f.google_maps_url ?? '',
    latitude: Number(f.latitude ?? 0),
    longitude: Number(f.longitude ?? 0),
    pricePerHour: f.schedules?.[0]?.price_per_slot ?? 0,
    rating: 0,
    reviewCount: 0,
    imageUrl: f.photos?.find((p: any) => p.is_cover)?.url ?? f.photos?.[0]?.url ?? '',
    images: f.photos?.map((p: any) => p.url) ?? [],
    amenities: [],
    owner: {
      id: f.owner?.id ?? '',
      name: f.owner?.user
        ? `${f.owner.user.first_name ?? ''} ${f.owner.user.last_name ?? ''}`.trim()
        : '',
      phone: f.owner?.user?.phone ?? '',
      rating: 0,
      totalFields: 1,
    },
    capacity: Number(f.capacity ?? 0),
    surface: f.surface_type ?? 'synthetic_turf',
    hasLighting: f.has_lighting ?? true,
    hasChangingRooms: f.has_changing_rooms ?? true,
    hasParking: f.has_parking ?? true,
    hasCafeteria: f.has_cafeteria ?? false,
    hasWifi: f.has_wifi ?? false,
    providesEquipment: f.provides_equipment ?? true,
    isAvailable: f.status === 'available',
    isFeatured: false,
    schedule: [],
  };
}

@Injectable({ providedIn: 'root' })
export class FieldService {
  private api = inject(ApiService);

  readonly loading = signal(false);
  readonly favorites = signal<string[]>(this.loadFavorites());

  private getCurrentUserId(): string | null {
    try {
      const stored = localStorage.getItem('xeweul_user');
      if (stored) {
        const u = JSON.parse(stored);
        return u.id || null;
      }
    } catch {}
    return null;
  }

  loadFavorites(): string[] {
    const userId = this.getCurrentUserId();
    if (!userId) return [];
    try {
      const stored = localStorage.getItem(`${FAVORITES_KEY}_${userId}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  reloadFavorites(): void {
    this.favorites.set(this.loadFavorites());
  }

  clearFavorites(): void {
    this.favorites.set([]);
  }

  toggleFavorite(fieldId: string): void {
    const userId = this.getCurrentUserId();
    if (!userId) return;

    this.favorites.update(favs => {
      const next = favs.includes(fieldId)
        ? favs.filter(id => id !== fieldId)
        : [...favs, fieldId];
      localStorage.setItem(`${FAVORITES_KEY}_${userId}`, JSON.stringify(next));
      return next;
    });
  }

  isFavorite(fieldId: string): boolean {
    return this.favorites().includes(fieldId);
  }

  getFields(sport?: SportCategory): Observable<Field[]> {
    const params = sport ? `?sport_type=${sport}&per_page=20` : '?per_page=20';
    return this.api.get<any>(`/fields${params}`).pipe(
      map(res => (Array.isArray(res) ? res : (res.data ?? [])).map(mapApiField))
    );
  }

  getFeaturedFields(): Observable<Field[]> {
    return this.api.get<any>('/fields?per_page=6').pipe(
      map(res => (Array.isArray(res) ? res : (res.data ?? [])).map(mapApiField))
    );
  }

  getNearbyFields(): Observable<Field[]> {
    return this.api.get<any>('/fields?per_page=6').pipe(
      map(res => (Array.isArray(res) ? res : (res.data ?? [])).map(mapApiField))
    );
  }

  getFieldById(id: string): Observable<Field | undefined> {
    return this.api.get<any>(`/fields/${id}`).pipe(
      map(f => f ? mapApiField(f) : undefined)
    );
  }

  searchFields(query: string): Observable<Field[]> {
    return this.api.get<any>('/fields?per_page=50').pipe(
      map(res => {
        const lower = query.toLowerCase();
        return (res.data ?? res)
          .map(mapApiField)
          .filter((f: Field) =>
            f.name.toLowerCase().includes(lower) ||
            f.address.toLowerCase().includes(lower) ||
            f.sport.toLowerCase().includes(lower)
          );
      })
    );
  }

  getDayBlocks(fieldId: string, dateFrom: string, dateTo: string): Observable<{ blocked_date: string }[]> {
    return this.api.get<any>(`/fields/${fieldId}/day-blocks?date_from=${dateFrom}&date_to=${dateTo}`).pipe(
      map(res => (Array.isArray(res) ? res : (res.data ?? [])))
    );
  }

  getAvailability(fieldId: string, date: string): Observable<AvailabilityResult> {
    return this.api.get<any>(`/fields/${fieldId}/availability?date=${date}`).pipe(
      map(res => {
        const slots: AvailabilitySlot[] = [];
        for (const schedule of (res.schedules ?? [])) {
          for (const slot of (schedule.slots ?? [])) {
            slots.push({
              schedule_id: schedule.schedule_id,
              slot_start: slot.slot_start,
              slot_end: slot.slot_end,
              available: slot.available,
              blocked: slot.blocked ?? false,
              price: slot.price,
              deposit_per_slot: slot.deposit_per_slot ?? null,
            });
          }
        }
        return { date: res.date, field_id: res.field_id, day_blocked: res.day_blocked ?? false, slots };
      })
    );
  }
}
