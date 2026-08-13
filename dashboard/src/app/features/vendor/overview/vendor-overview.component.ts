import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-vendor-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './vendor-overview.component.html',
  styleUrl: './vendor-overview.component.scss',
})
export class VendorOverviewComponent implements OnInit {
  private api = inject(ApiService);

  products = signal<any[]>([]);
  orders = signal<any[]>([]);
  earnings = signal<any>(null);
  loading = signal(true);

  readonly activeProductsCount = computed(() =>
    this.products().length
  );

  readonly pendingOrdersCount = computed(() =>
    this.orders().filter(o => o.status === 'PAID' || o.status === 'PENDING_PAYMENT').length
  );

  readonly totalSalesRevenue = computed(() => {
    if (this.earnings()?.totalRevenue) return this.earnings().totalRevenue;
    return this.orders()
      .filter(o => o.status === 'DELIVERED' || o.status === 'PAID')
      .reduce((acc, o) => acc + Number(o.total_amount || 0), 0);
  });

  readonly availableBalance = computed(() =>
    this.earnings()?.availableBalance || 0
  );

  readonly recentOrders = computed(() =>
    this.orders().slice(0, 5)
  );

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);

    this.api.get<any>('/products/vendor').subscribe({
      next: (res) => this.products.set(res.data || []),
      error: () => {}
    });

    this.api.get<any>('/orders/vendor').subscribe({
      next: (res) => this.orders.set(res.data || (Array.isArray(res) ? res : [])),
      error: () => {}
    });

    this.api.get<any>('/vendor/earnings').subscribe({
      next: (res) => {
        this.earnings.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      'PAID': 'Payée (À livrer)',
      'DELIVERED': 'Livrée',
      'PENDING_PAYMENT': 'En attente',
      'CANCELLED': 'Annulée'
    };
    return map[status] || status;
  }
}
