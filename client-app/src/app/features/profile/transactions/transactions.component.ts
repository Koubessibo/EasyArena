import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf, NgFor, NgClass, DatePipe } from '@angular/common';
import { BookingService } from '../../../core/services/booking.service';
import { ApiService } from '../../../core/services/api.service';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

interface Transaction {
  id: string;
  type: 'booking' | 'shop' | 'ticket' | 'subscription';
  label: string;
  sublabel: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  date: string;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, RouterLink, DatePipe, FcfaPipe],
  template: `
<div class="tx-page">

  <!-- Header -->
  <header class="tx-header">
    <button class="tx-header__back" routerLink="/profile" aria-label="Retour">
      <span class="material-symbols-outlined">arrow_back</span>
    </button>
    <h1 class="tx-header__title">Transactions</h1>
    <div class="tx-header__spacer"></div>
  </header>

  <!-- Summary cards -->
  <div class="tx-summary" *ngIf="!loading() && transactions().length > 0">
    <div class="tx-sum-card tx-sum-card--green">
      <span class="material-symbols-outlined">payments</span>
      <div>
        <p class="tx-sum-card__num">{{ totalPaid() | fcfa }}</p>
        <p class="tx-sum-card__label">Total dépensé</p>
      </div>
    </div>
    <div class="tx-sum-card tx-sum-card--dark">
      <span class="material-symbols-outlined">receipt_long</span>
      <div>
        <p class="tx-sum-card__num">{{ transactions().length }}</p>
        <p class="tx-sum-card__label">Transactions</p>
      </div>
    </div>
  </div>

  <!-- Filter tabs -->
  <div class="tx-filters" *ngIf="!loading() && transactions().length > 0">
    <button class="tx-filter" [class.tx-filter--active]="activeFilter() === 'all'"
            (click)="activeFilter.set('all')">Tout</button>
    <button class="tx-filter" [class.tx-filter--active]="activeFilter() === 'booking'"
            (click)="activeFilter.set('booking')">Réservations</button>
    <button class="tx-filter" [class.tx-filter--active]="activeFilter() === 'shop'"
            (click)="activeFilter.set('shop')">Boutique</button>
    <button class="tx-filter" [class.tx-filter--active]="activeFilter() === 'ticket'"
            (click)="activeFilter.set('ticket')">Billets</button>
  </div>

  <!-- Loading skeleton -->
  <div class="tx-body" *ngIf="loading()">
    <div class="tx-skel" *ngFor="let i of [1,2,3,4,5]">
      <div class="skel-circle skel-pulse"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
        <div class="skel-bar skel-pulse" style="width:60%;height:14px;"></div>
        <div class="skel-bar skel-pulse" style="width:40%;height:11px;"></div>
      </div>
      <div class="skel-bar skel-pulse" style="width:80px;height:16px;"></div>
    </div>
  </div>

  <!-- Empty -->
  <div class="tx-empty" *ngIf="!loading() && filtered().length === 0">
    <div class="tx-empty__icon">
      <span class="material-symbols-outlined">receipt_long</span>
    </div>
    <h3>Aucune transaction</h3>
    <p>Vos paiements apparaîtront ici.</p>
    <a routerLink="/home" class="tx-empty__btn">Explorer les terrains</a>
  </div>

  <!-- List -->
  <div class="tx-body" *ngIf="!loading() && filtered().length > 0">
    <div class="tx-item" *ngFor="let tx of filtered()">
      <div class="tx-item__icon-wrap" [ngClass]="'tx-icon--' + tx.type">
        <span class="material-symbols-outlined">{{ typeIcon(tx.type) }}</span>
      </div>
      <div class="tx-item__info">
        <span class="tx-item__label">{{ tx.label }}</span>
        <span class="tx-item__sub">{{ tx.sublabel }} · {{ tx.date | date:'dd MMM yyyy' }}</span>
      </div>
      <div class="tx-item__right">
        <span class="tx-item__amount" [class.tx-item__amount--negative]="tx.amount > 0">
          {{ tx.amount > 0 ? '-' : '+' }}{{ tx.amount | fcfa }}
        </span>
        <span class="tx-item__status" [ngClass]="'tx-status--' + tx.status">
          {{ statusLabel(tx.status) }}
        </span>
      </div>
    </div>
  </div>

</div>
  `,
  styles: [`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

.tx-page {
  min-height: 100vh;
  background: #f8fafc;
  font-family: 'Inter', sans-serif;
  padding-bottom: 5rem;
}

.tx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  position: sticky;
  top: 0;
  z-index: 30;

  &__back {
    width: 40px; height: 40px; border-radius: 50%;
    border: 1.5px solid #e2e8f0; background: #f8fafc; color: #0f172a;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.2s;
    &:hover { background: #e2e8f0; }
    .material-symbols-outlined { font-size: 1.25rem; }
  }

  &__title { font-size: 1rem; font-weight: 800; color: #0f172a; flex: 1; text-align: center; }
  &__spacer { width: 40px; }
}

.tx-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem 0;
  max-width: 680px;
  margin: 0 auto;
}

.tx-sum-card {
  border-radius: 18px;
  padding: 1.1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  box-shadow: 0 4px 14px rgba(0,0,0,0.06);

  .material-symbols-outlined { font-size: 1.75rem; }

  &--green { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
  &--dark  { background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff; }

  &__num   { font-size: 1.15rem; font-weight: 900; margin: 0; }
  &__label { font-size: 0.72rem; opacity: 0.75; margin: 0; font-weight: 500; }
}

.tx-filters {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.25rem 0;
  max-width: 680px;
  margin: 0 auto;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.tx-filter {
  padding: 0.5rem 1.1rem;
  border-radius: 30px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  font-family: 'Inter', sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  &--active { background: #0f172a; color: #fff; border-color: #0f172a; }
}

.tx-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 1rem 1.25rem;
  max-width: 680px;
  margin: 0 auto;
  background: #fff;
  border-radius: 22px;
  border: 1px solid #e2e8f0;
  margin-top: 1rem;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}

.tx-item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 0;
  border-bottom: 1px solid #f1f5f9;
  &:last-child { border-bottom: none; }

  &__icon-wrap {
    width: 44px; height: 44px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    .material-symbols-outlined { font-size: 1.25rem; }
  }

  &__info { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0; }
  &__label { font-size: 0.9rem; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  &__sub { font-size: 0.75rem; color: #94a3b8; font-weight: 500; }

  &__right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; flex-shrink: 0; }
  &__amount { font-size: 0.95rem; font-weight: 800; color: #0f172a;
    &--negative { color: #ef4444; }
  }
  &__status {
    font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 20px;
  }
}

.tx-icon--booking { background: #d1fae5; color: #065f46; }
.tx-icon--shop    { background: #dbeafe; color: #1e40af; }
.tx-icon--ticket  { background: #fef3c7; color: #92400e; }
.tx-icon--subscription { background: #f3e8ff; color: #6b21a8; }

.tx-status--paid       { background: #d1fae5; color: #065f46; }
.tx-status--pending    { background: #fef3c7; color: #92400e; }
.tx-status--failed     { background: #fee2e2; color: #991b1b; }
.tx-status--refunded   { background: #e0f2fe; color: #0c4a6e; }

/* Skeleton */
.tx-skel {
  display: flex; align-items: center; gap: 0.875rem;
  padding: 1rem 0; border-bottom: 1px solid #f1f5f9; &:last-child { border-bottom: none; }
}
.skel-circle { width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0; background: #e2e8f0; }
.skel-bar    { border-radius: 6px; background: #e2e8f0; }
.skel-pulse  {
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Empty */
.tx-empty {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 4rem 2rem; text-align: center;

  &__icon {
    width: 70px; height: 70px; border-radius: 50%; background: #f1f5f9;
    display: flex; align-items: center; justify-content: center; color: #94a3b8;
    .material-symbols-outlined { font-size: 2rem; }
  }
  h3 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a; }
  p  { margin: 0; font-size: 0.875rem; color: #64748b; }
  &__btn {
    padding: 0.7rem 1.5rem; background: #10b981; color: #fff; border-radius: 30px;
    font-size: 0.875rem; font-weight: 700; text-decoration: none; transition: background 0.2s;
    &:hover { background: #059669; }
  }
}
  `],
})
export class TransactionsComponent implements OnInit {
  private bookingService = inject(BookingService);
  private apiService     = inject(ApiService);

  loading      = signal(true);
  transactions = signal<Transaction[]>([]);
  activeFilter = signal<'all' | 'booking' | 'shop' | 'ticket'>('all');

  readonly totalPaid = computed(() =>
    this.transactions().filter(t => t.status === 'paid').reduce((a, t) => a + t.amount, 0)
  );

  readonly filtered = computed(() => {
    const f = this.activeFilter();
    if (f === 'all') return this.transactions();
    return this.transactions().filter(t => t.type === f);
  });

  ngOnInit(): void {
    // Load bookings as transactions
    this.bookingService.getBookings().subscribe({
      next: (bookings) => {
        const bookingTx: Transaction[] = bookings.map(b => ({
          id: b.id,
          type: 'booking',
          label: b.fieldName || 'Réservation terrain',
          sublabel: b.date ? b.date + (b.startTime ? ' · ' + b.startTime : '') : '',
          amount: b.pricing?.total ?? 0,
          status: b.payment?.status === 'paid' ? 'paid'
               : b.payment?.status === 'failed' ? 'failed'
               : b.payment?.status === 'refunded' ? 'refunded' : 'pending',
          date: b.createdAt || b.date,
        }));

        // Also try to load shop orders
        this.apiService.get<any>('/orders/my-orders').subscribe({
          next: (res) => {
            const orders = Array.isArray(res) ? res : (res.data ?? []);
            const shopTx: Transaction[] = orders.map((o: any) => ({
              id: o.id,
              type: 'shop',
              label: `Commande boutique (#${o.id?.slice(-6) ?? '—'})`,
              sublabel: `${o.items?.length ?? 0} article(s)`,
              amount: o.total_amount ?? 0,
              status: o.payment_status === 'paid' ? 'paid' : 'pending',
              date: o.created_at ?? '',
            }));
            this.transactions.set([...bookingTx, ...shopTx].sort((a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
            ));
            this.loading.set(false);
          },
          error: () => {
            // Shop orders failed, show only bookings
            this.transactions.set(bookingTx.sort((a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
            ));
            this.loading.set(false);
          },
        });
      },
      error: () => this.loading.set(false),
    });
  }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      booking: 'calendar_today',
      shop: 'shopping_bag',
      ticket: 'confirmation_number',
      subscription: 'card_membership',
    };
    return icons[type] || 'receipt';
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      paid: 'Payé', pending: 'En attente', failed: 'Échoué', refunded: 'Remboursé',
    };
    return labels[status] || status;
  }
}
