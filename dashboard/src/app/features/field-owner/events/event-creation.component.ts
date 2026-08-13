import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-event-creation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './event-creation.component.html',
  styleUrls: ['./event-creation.component.scss']
})
export class EventCreationComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  public location = inject(Location);

  isSubmitting = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  
  myEvents = signal<any[]>([]);
  editingEventId = signal<string | null>(null);

  coverImageBase64 = signal<string | null>(null);
  fileName = signal<string | null>(null);

  eventForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    date: ['', Validators.required],
    time: ['', Validators.required],
    location: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10)]],
    ticket_price: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    this.fetchMyEvents();
  }

  fetchMyEvents(): void {
    this.api.get<any>('/events/owner/my-events').subscribe({
      next: (res) => {
        this.myEvents.set(res.data || []);
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.fileName.set(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        this.coverImageBase64.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  openEditEvent(event: any): void {
    this.editingEventId.set(event.id);
    this.eventForm.patchValue({
      name: event.name,
      date: event.date,
      time: event.time,
      location: event.location,
      description: event.description,
      ticket_price: event.ticket_price || 0,
    });
    this.coverImageBase64.set(event.cover_image_url || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingEventId.set(null);
    this.eventForm.reset({ ticket_price: 0 });
    this.coverImageBase64.set(null);
    this.fileName.set(null);
  }

  deleteEvent(id: string): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet événement ? Les billets associés seront annulés.')) {
      this.api.delete<any>(`/events/${id}`).subscribe({
        next: () => {
          this.myEvents.update(list => list.filter(e => e.id !== id));
          this.successMessage.set('L\'événement a été supprimé avec succès.');
          setTimeout(() => this.successMessage.set(null), 3000);
        }
      });
    }
  }

  onSubmit() {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const payload = {
      ...this.eventForm.value,
      cover_image_url: this.coverImageBase64(),
    };

    const editId = this.editingEventId();
    if (editId) {
      this.api.put<any>(`/events/${editId}`, payload).subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          this.successMessage.set('L\'événement a été mis à jour avec succès !');
          this.cancelEdit();
          this.fetchMyEvents();
          setTimeout(() => this.successMessage.set(null), 4000);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(err.message || 'Erreur lors de la modification.');
        }
      });
    } else {
      this.api.post<any>('/events', payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.successMessage.set('L\'événement sportif a été créé avec succès !');
          this.cancelEdit();
          this.fetchMyEvents();
          setTimeout(() => this.successMessage.set(null), 4000);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(err.message || 'Erreur lors de la création.');
        }
      });
    }
  }
}
