import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

export interface CancellationRequest {
  id: string;
  client: {
    first_name: string;
    last_name: string;
  };
  field: {
    name: string;
  };
  booking_date: string;
  slot_start: string;
  slot_end: string;
  total_amount: number;
}

@Component({
  selector: 'app-cancellation-management',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cancellation-management.component.html',
  styleUrls: ['./cancellation-management.component.scss'],
})
export class CancellationManagementComponent implements OnInit {
  private api = inject(ApiService);
  public location = inject(Location);

  pendingRequests = signal<CancellationRequest[]>([]);
  processingId = signal<string | null>(null);
  
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.fetchPendingRequests();
  }

  fetchPendingRequests(): void {
    this.isLoading.set(true);
    this.api.get<any>('/cancellations/pending').subscribe({
      next: (res) => {
        this.pendingRequests.set(res.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set('Erreur lors du chargement des demandes d\'annulation.');
        this.isLoading.set(false);
      },
    });
  }

  processRequest(requestId: string, isAccepted: boolean): void {
    if (this.processingId() !== null) return;

    this.processingId.set(requestId);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = {
      reservation_id: requestId,
      is_accepted: isAccepted
    };

    this.api.post<any>('/cancellations/process', payload).subscribe({
      next: (res) => {
        // Mise à jour optimiste : retirer la demande de la liste
        this.pendingRequests.update(requests => requests.filter(r => r.id !== requestId));
        this.processingId.set(null);
        this.successMessage.set(isAccepted ? 'Annulation acceptée avec succès.' : 'Annulation refusée avec succès.');
        
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (err) => {
        this.processingId.set(null);
        this.errorMessage.set(err.message || 'Erreur lors du traitement de la demande.');
      }
    });
  }
}
