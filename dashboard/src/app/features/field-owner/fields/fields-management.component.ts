import { Component, inject, signal, computed } from '@angular/core';
import { NgFor, NgIf, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { switchMap, forkJoin, of } from 'rxjs';
import { FieldOwnerService } from '../../../core/services/field-owner.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { Field, FieldPhoto, FieldType, FieldStatus } from '../../../core/models/field.model';

const SPORT_SURFACES_MAP: Record<FieldType, { value: string; label: string }[]> = {
  football: [
    { value: 'synthetic_turf', label: 'Gazon Synthétique High-Tech' },
    { value: 'natural_grass', label: 'Gazon Naturel Certifié' },
    { value: 'clay', label: 'Terre Battue / Stabilisé' },
    { value: 'sand', label: 'Sable / Beach Soccer' },
  ],
  basketball: [
    { value: 'parquet', label: 'Parquet / Salle Couverte (Indoor)' },
    { value: 'resin', label: 'Résine Synthétique / Tartan (Outdoor)' },
    { value: 'hard_court', label: 'Béton Bitumineux / Hard Court' },
  ],
  tennis: [
    { value: 'clay', label: 'Terre Battue Ocre' },
    { value: 'hard_court', label: 'Résine / Quick Court (Dur)' },
    { value: 'synthetic_turf', label: 'Gazon Synthétique Tennis' },
    { value: 'parquet', label: 'Parquet / Salles Couvertes' },
  ],
  padel: [
    { value: 'synthetic_turf', label: 'Gazon Synthétique Sablé Padel' },
    { value: 'resin', label: 'Résine Spéciale Padel' },
  ],
  volleyball: [
    { value: 'parquet', label: 'Parquet / Taraflex Indoor' },
    { value: 'sand', label: 'Sable Fin / Beach Volleyball' },
    { value: 'resin', label: 'Résine Synthétique Outdoor' },
  ],
  multi: [
    { value: 'synthetic_turf', label: 'Gazon Synthétique' },
    { value: 'parquet', label: 'Parquet Multisport' },
    { value: 'resin', label: 'Résine / Tartan' },
    { value: 'hard_court', label: 'Béton / Hard Court' },
  ],
};

@Component({
  selector: 'app-fields-management',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, PageHeaderComponent, StatusBadgeComponent, FcfaPipe],
  templateUrl: './fields-management.component.html',
  styleUrl: './fields-management.component.scss',
})
export class FieldsManagementComponent {
  svc = inject(FieldOwnerService);
  public location = inject(Location);
  fields = this.svc.fields;
  showForm = signal(false);
  saving = signal(false);
  feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  constructor() {
    this.svc.loadFields();
  }
  editingField = signal<Field | null>(null);

  form = signal({
    name: '',
    type: 'football' as FieldType,
    status: 'active' as FieldStatus,
    pricePerHour: 0,
    depositPerHour: 0,
    location: '',
    contactPhone: '',
    contactEmail: '',
    googleMapsUrl: '',
    surfaceType: 'synthetic_turf',
    hasLighting: true,
    hasChangingRooms: true,
    hasParking: true,
    hasCafeteria: false,
    hasWifi: false,
    providesEquipment: true,
    capacity: 10,
    imageUrl: '',
  });

  pendingFiles = signal<File[]>([]);
  previews = signal<string[]>([]);

  fieldTypes: { value: FieldType; label: string }[] = [
    { value: 'football', label: 'Football' },
    { value: 'basketball', label: 'Basketball' },
    { value: 'tennis', label: 'Tennis' },
    { value: 'padel', label: 'Padel' },
    { value: 'volleyball', label: 'Volleyball' },
    { value: 'multi', label: 'Multi-sport' },
  ];

  readonly availableSurfaces = computed(() => {
    const sport = this.form().type;
    return SPORT_SURFACES_MAP[sport] ?? SPORT_SURFACES_MAP.football;
  });

  openAdd(): void {
    this.editingField.set(null);
    this.form.set({
      name: '', type: 'football', status: 'active', pricePerHour: 0, depositPerHour: 0,
      location: '', contactPhone: '', contactEmail: '', googleMapsUrl: '',
      surfaceType: 'synthetic_turf', hasLighting: true, hasChangingRooms: true,
      hasParking: true, hasCafeteria: false, hasWifi: false, providesEquipment: true,
      capacity: 10, imageUrl: ''
    });
    this.pendingFiles.set([]);
    this.previews.set([]);
    this.showForm.set(true);
  }

  openEdit(field: Field): void {
    this.editingField.set(field);
    const defaultSurface = SPORT_SURFACES_MAP[field.type]?.[0]?.value ?? 'synthetic_turf';
    this.form.set({
      name: field.name,
      type: field.type,
      status: field.status,
      pricePerHour: field.pricePerHour,
      depositPerHour: field.depositPerHour ?? 0,
      location: field.location,
      contactPhone: field.contactPhone ?? '',
      contactEmail: field.contactEmail ?? '',
      googleMapsUrl: field.googleMapsUrl ?? '',
      surfaceType: field.surfaceType ?? defaultSurface,
      hasLighting: field.hasLighting ?? true,
      hasChangingRooms: field.hasChangingRooms ?? true,
      hasParking: field.hasParking ?? true,
      hasCafeteria: field.hasCafeteria ?? false,
      hasWifi: field.hasWifi ?? false,
      providesEquipment: field.providesEquipment ?? true,
      capacity: field.capacity,
      imageUrl: field.imageUrl ?? ''
    });
    this.pendingFiles.set([]);
    this.previews.set([]);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.previews().forEach(url => URL.revokeObjectURL(url));
    this.pendingFiles.set([]);
    this.previews.set([]);
    this.showForm.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const newFiles = Array.from(input.files);
    this.pendingFiles.update(list => [...list, ...newFiles]);
    this.previews.update(list => [...list, ...newFiles.map(f => URL.createObjectURL(f))]);
    input.value = '';
  }

  removePendingFile(index: number): void {
    URL.revokeObjectURL(this.previews()[index]);
    this.pendingFiles.update(list => list.filter((_, i) => i !== index));
    this.previews.update(list => list.filter((_, i) => i !== index));
  }

  deleteExistingPhoto(photo: FieldPhoto): void {
    const field = this.editingField();
    if (!field) return;
    this.svc.deleteFieldPhoto(field.id, photo.id).subscribe({
      next: () => {
        const updated = { ...field, photos: (field.photos ?? []).filter(p => p.id !== photo.id) };
        this.editingField.set(updated);
        this.fields.update(list => list.map(f => f.id === field.id ? updated : f));
      },
      error: (err: Error) => this.svc.error.set(err.message),
    });
  }

  save(): void {
    const f = this.form();
    const editing = this.editingField();
    const files = this.pendingFiles();
    this.saving.set(true);

    const uploadPhotos = (fieldId: string, isNew: boolean) => {
      if (!files.length) return of(null);
      return forkJoin(
        files.map((file, i) => this.svc.uploadFieldPhoto(fieldId, file, isNew && i === 0))
      );
    };

    const source$ = editing
      ? this.svc.updateField(editing.id, f).pipe(
          switchMap(updated => uploadPhotos(updated.id, false))
        )
      : this.svc.addField({ ...f, ownerId: '' }).pipe(
          switchMap(created => uploadPhotos(created.id, true))
        );

    source$.subscribe({
      next: () => {
        const isEditing = !!this.editingField();
        this.saving.set(false);
        this.closeForm();
        this.svc.loadFields();
        this.feedback.set({ type: 'success', message: isEditing ? 'Terrain mis à jour avec succès.' : 'Terrain créé avec succès.' });
        setTimeout(() => this.feedback.set(null), 5000);
      },
      error: (err: Error) => { this.saving.set(false); this.svc.error.set(err.message); },
    });
  }

  delete(id: string): void {
    if (!confirm('Supprimer ce terrain ? Cette action est irréversible.')) return;
    this.svc.deleteField(id, (err: Error) => {
      this.feedback.set({ type: 'error', message: err.message });
      setTimeout(() => this.feedback.set(null), 7000);
    });
  }

  typeLabel(type: string): string {
    return this.fieldTypes.find(t => t.value === type)?.label ?? type;
  }

  updateForm(key: string, value: string | number | boolean): void {
    if (key === 'type') {
      const sport = value as FieldType;
      const defaultSurface = SPORT_SURFACES_MAP[sport]?.[0]?.value ?? 'synthetic_turf';
      this.form.update(f => ({ ...f, type: sport, surfaceType: defaultSurface }));
    } else {
      this.form.update(f => ({ ...f, [key]: value }));
    }
  }
}
