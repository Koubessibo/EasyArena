import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

export interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  product?: { name: string; image_url: string };
}

export interface Order {
  id: string;
  reference: string;
  total_amount: number;
  status: 'PENDING_PAYMENT' | 'PAID' | 'DELIVERED' | 'CANCELLED';
  payment_phone: string;
  created_at: string;
  items: OrderItem[];
}

@Component({
  selector: 'app-my-orders',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-orders.component.html',
  styleUrls: ['./my-orders.component.scss']
})
export class MyOrdersComponent implements OnInit {
  private api = inject(ApiService);

  orders = signal<Order[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.api.get<any>('/orders/my-orders').subscribe({
      next: (res) => {
        this.orders.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Impossible de charger vos commandes.');
        this.isLoading.set(false);
      }
    });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING_PAYMENT: 'En attente de paiement',
      PAID: 'Payé',
      DELIVERED: 'Livré',
      CANCELLED: 'Annulé',
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    const classes: Record<string, string> = {
      PENDING_PAYMENT: 'status--pending',
      PAID: 'status--paid',
      DELIVERED: 'status--delivered',
      CANCELLED: 'status--cancelled',
    };
    return classes[status] ?? '';
  }
}
