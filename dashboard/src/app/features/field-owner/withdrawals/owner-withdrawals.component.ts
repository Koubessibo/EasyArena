import { Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../core/services/field-owner.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { ExportService } from '../../../core/services/export.service';
import { WithdrawalRequest } from '../../../core/models/transaction.model';

@Component({
  selector: 'app-owner-withdrawals',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, FcfaPipe],
  templateUrl: './owner-withdrawals.component.html',
  styleUrl: './owner-withdrawals.component.scss',
})
export class OwnerWithdrawalsComponent {
  private svc = inject(FieldOwnerService);
  private exportService = inject(ExportService);
  public location = inject(Location);

  data = signal<WithdrawalRequest[]>([]);
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
    this.svc.loadWithdrawalsFiltered(
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

  methodLabel(method: string): string {
    return method === 'bank_transfer' ? 'Virement bancaire' : 'Mobile Money';
  }

  statusMap(status: string): string {
    const map: Record<string, string> = { pending: 'pending', approved: 'active', rejected: 'rejected', completed: 'completed' };
    return map[status] ?? status;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', completed: 'Traité' };
    return map[status] ?? status;
  }

  exportPdf(): void {
    const headers = ['Date', 'Méthode', 'Destination', 'Statut', 'Montant (FCFA)'];
    const rows = this.data().map(w => [
      new Date(w.requestedAt).toLocaleDateString('fr-FR'),
      this.methodLabel(w.method),
      w.destination,
      this.statusLabel(w.status),
      w.amount.toLocaleString('fr-FR'),
    ]);
    this.exportService.exportToPdf('Journal des Retraits', headers, rows, `retraits-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportExcel(): void {
    const headers = ['Date', 'Méthode', 'Destination', 'Statut', 'Montant (FCFA)'];
    const rows = this.data().map(w => [
      new Date(w.requestedAt).toLocaleDateString('fr-FR'),
      this.methodLabel(w.method),
      w.destination,
      this.statusLabel(w.status),
      w.amount,
    ]);
    this.exportService.exportToExcel('Retraits', headers, rows, `retraits-${new Date().toISOString().split('T')[0]}.xlsx`);
  }
}
