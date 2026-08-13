import { Component, inject, signal, computed } from '@angular/core';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { VendorService } from '../../../core/services/vendor.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { OrderStatus } from '../../../core/models/product.model';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, PageHeaderComponent, StatusBadgeComponent, FcfaPipe],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
})
export class OrdersComponent {
  private svc = inject(VendorService);
  orders = this.svc.orders;
  filterStatus = signal<OrderStatus | 'all'>('all');

  filteredOrders = computed(() => {
    const status = this.filterStatus();
    return status === 'all' ? this.orders() : this.orders().filter(o => o.status === status);
  });

  statusFilters: { value: OrderStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'pending', label: 'En attente' },
    { value: 'confirmed', label: 'Confirmées' },
    { value: 'delivered', label: 'Livrées' },
    { value: 'cancelled', label: 'Annulées' },
  ];

  productsLabel(products: { name: string; qty: number }[]): string {
    return products.map(p => `${p.name} ×${p.qty}`).join(', ');
  }
}
