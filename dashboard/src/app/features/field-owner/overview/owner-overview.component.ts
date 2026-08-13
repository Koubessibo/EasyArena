import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ExportService } from '../../../core/services/export.service';

export interface Transaction {
  id: string;
  type: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: string | number;
  created_at: string;
  reference: string;
  description: string;
}

@Component({
  selector: 'app-owner-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './owner-overview.component.html',
  styleUrls: ['./owner-overview.component.scss']
})
export class OwnerOverviewComponent implements OnInit {
  private api = inject(ApiService);
  private exportService = inject(ExportService);

  transactions = signal<Transaction[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);

  globalStats = computed(() => {
    const txs = this.transactions();
    
    const totalRevenue = txs
      .filter(t => t.direction === 'CREDIT' && t.type === 'BOOKING_CREDIT')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalCommissions = txs
      .filter(t => t.direction === 'DEBIT' && (t.type === 'FEE_DEBIT' || t.description?.includes('Frais')))
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalBookings = txs.filter(t => t.direction === 'CREDIT' && t.type === 'BOOKING_CREDIT').length;

    const netRevenue = totalRevenue - totalCommissions;

    return {
      netRevenue,
      totalCommissions,
      totalBookings
    };
  });

  ngOnInit(): void {
    this.fetchTransactions();
  }

  fetchTransactions(): void {
    this.isLoading.set(true);
    this.api.get<any>('/reports/transactions').subscribe({
      next: (res) => {
        this.transactions.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Impossible de charger les données financières.');
        this.isLoading.set(false);
      }
    });
  }

  exportToPDF(): void {
    const headers = ['Date', 'Référence', 'Type', 'Sens', 'Montant (FCFA)', 'Description'];
    const rows = this.transactions().map(t => [
      new Date(t.created_at).toLocaleDateString('fr-FR') + ' ' + new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      t.reference || (t.id ? t.id.slice(0, 8).toUpperCase() : 'N/A'),
      t.type || 'BOOKING',
      t.direction === 'CREDIT' ? 'Crédit (+)' : 'Débit (-)',
      Number(t.amount).toLocaleString('fr-FR'),
      t.description || '-'
    ]);

    this.exportService.exportToPdf(
      'Rapport des Transactions Financières',
      headers,
      rows,
      `rapport-transactions-${new Date().toISOString().split('T')[0]}.pdf`
    );
  }

  exportToExcel(): void {
    const headers = ['Date', 'Référence', 'Type', 'Sens', 'Montant (FCFA)', 'Description'];
    const rows = this.transactions().map(t => [
      new Date(t.created_at).toLocaleString('fr-FR'),
      t.reference || (t.id ? t.id.slice(0, 8).toUpperCase() : 'N/A'),
      t.type || 'BOOKING',
      t.direction,
      Number(t.amount),
      t.description || '-'
    ]);

    this.exportService.exportToExcel(
      'Transactions',
      headers,
      rows,
      `rapport-transactions-${new Date().toISOString().split('T')[0]}.xlsx`
    );
  }
}
