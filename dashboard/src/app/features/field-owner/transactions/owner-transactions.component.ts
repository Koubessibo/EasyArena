import { Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../core/services/field-owner.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { ExportService } from '../../../core/services/export.service';
import { Transaction } from '../../../core/models/transaction.model';

@Component({
  selector: 'app-owner-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, FcfaPipe],
  templateUrl: './owner-transactions.component.html',
  styleUrl: './owner-transactions.component.scss',
})
export class OwnerTransactionsComponent {
  private svc = inject(FieldOwnerService);
  private exportService = inject(ExportService);
  public location = inject(Location);

  data = signal<Transaction[]>([]);
  total = signal(0);
  page = signal(1);
  perPage = 20;
  loading = signal(false);

  filterStartDate = signal('');
  filterEndDate = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.loadTransactionsFiltered(
      this.page(), this.perPage,
      this.filterStartDate() || undefined,
      this.filterEndDate() || undefined,
    ).subscribe({
      next: (res) => { this.data.set(res.data); this.total.set(res.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  clearFilter(): void {
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.page.set(1);
    this.load();
  }

  get totalPages(): number {
    return Math.ceil(this.total() / this.perPage) || 1;
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page.set(p);
    this.load();
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      booking_payment: 'Paiement réservation',
      withdrawal: 'Retrait',
      platform_fee: 'Commission',
      refund: 'Remboursement',
    };
    return labels[type] ?? type;
  }

  exportPdf(): void {
    const headers = ['Type', 'Description', 'Date', 'Montant (FCFA)'];
    const rows = this.data().map(tx => [
      this.typeLabel(tx.type),
      tx.description,
      new Date(tx.createdAt).toLocaleDateString('fr-FR'),
      tx.amount.toLocaleString('fr-FR'),
    ]);
    this.exportService.exportToPdf('Journal des Transactions', headers, rows, `transactions-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportExcel(): void {
    const headers = ['Type', 'Description', 'Date', 'Montant (FCFA)'];
    const rows = this.data().map(tx => [
      this.typeLabel(tx.type),
      tx.description,
      new Date(tx.createdAt).toLocaleDateString('fr-FR'),
      tx.amount,
    ]);
    this.exportService.exportToExcel('Transactions', headers, rows, `transactions-${new Date().toISOString().split('T')[0]}.xlsx`);
  }
}
