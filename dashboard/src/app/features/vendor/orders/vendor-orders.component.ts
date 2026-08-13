import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { Order, OrderStatus } from '../../../core/models/order.model';

@Component({
  selector: 'app-vendor-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vendor-orders.component.html',
  styleUrls: ['./vendor-orders.component.scss']
})
export class VendorOrdersComponent implements OnInit {
  private api = inject(ApiService);

  orders = signal<Order[]>([]);
  isLoading = signal(true);
  isDelivering = signal<string | null>(null);
  activeStatusTab = signal<string>('all');
  searchQuery = signal<string>('');

  readonly statusTabs = [
    { value: 'all', label: 'Toutes les commandes', icon: 'apps' },
    { value: 'PAID', label: 'À préparer / Payées', icon: 'schedule' },
    { value: 'DELIVERED', label: 'Livrées', icon: 'task_alt' },
    { value: 'CANCELLED', label: 'Annulées', icon: 'cancel' },
  ];

  readonly filteredOrders = computed(() => {
    let list = this.orders();
    const tab = this.activeStatusTab();
    const q = this.searchQuery().toLowerCase().trim();

    if (tab !== 'all') {
      if (tab === 'PAID') {
        list = list.filter(o => o.status === 'PAID' || o.status === 'PENDING_PAYMENT');
      } else {
        list = list.filter(o => o.status === tab);
      }
    }

    if (q) {
      list = list.filter(o => {
        const idMatch = (o.id || '').toLowerCase().includes(q);
        const phoneMatch = (o.payment_phone || '').toLowerCase().includes(q);
        const itemMatch = (o.items || []).some((i: any) =>
          (i.product?.name || '').toLowerCase().includes(q)
        );
        return idMatch || phoneMatch || itemMatch;
      });
    }

    return list;
  });

  readonly pendingCount = computed(() =>
    this.orders().filter(o => o.status === 'PAID' || o.status === 'PENDING_PAYMENT').length
  );

  readonly deliveredCount = computed(() =>
    this.orders().filter(o => o.status === 'DELIVERED').length
  );

  ngOnInit(): void {
    this.fetchOrders();
  }

  fetchOrders(): void {
    this.isLoading.set(true);
    this.api.get<any>('/orders/vendor').subscribe({
      next: (res) => {
        const ordersList = res && res.data ? res.data : (Array.isArray(res) ? res : []);
        this.orders.set(ordersList);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching vendor orders:', err);
        this.isLoading.set(false);
      }
    });
  }

  markAsDelivered(orderId: string): void {
    this.isDelivering.set(orderId);
    this.api.patch<any>(`/orders/${orderId}/deliver`, {}).subscribe({
      next: (res) => {
        const updatedOrder = res && res.data ? res.data : res;
        this.orders.update(orders =>
          orders.map(o => o.id === orderId ? { ...o, status: updatedOrder.status } : o)
        );
        this.isDelivering.set(null);
      },
      error: () => {
        this.isDelivering.set(null);
        alert('Erreur lors de la mise à jour.');
      }
    });
  }

  getStatusLabel(status: OrderStatus): string {
    const labels: Record<string, string> = {
      'PENDING_PAYMENT': 'En attente de paiement',
      'PAID': 'Payée (À livrer)',
      'DELIVERED': 'Livrée au client',
      'CANCELLED': 'Annulée'
    };
    return labels[status] || status;
  }

  getStatusIcon(status: OrderStatus): string {
    const icons: Record<string, string> = {
      'PENDING_PAYMENT': 'hourglass_top',
      'PAID': 'pending_actions',
      'DELIVERED': 'task_alt',
      'CANCELLED': 'cancel'
    };
    return icons[status] || 'inventory';
  }

  getProductCategoryIcon(name?: string): string {
    const lower = (name || '').toLowerCase();
    if (lower.includes('eau') || lower.includes('bouteille') || lower.includes('boisson')) return 'local_drink';
    if (lower.includes('chaussure') || lower.includes('crampon')) return 'footprint';
    if (lower.includes('maillot') || lower.includes('t-shirt') || lower.includes('veste')) return 'checkroom';
    return 'sports_soccer';
  }

  getProductImage(product: any): string | null {
    if (!product) return null;
    return product.image_url || product.imageUrl || null;
  }
}
