import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [NgClass],
  template: `<span class="badge badge--dot" [ngClass]="badgeClass">{{ label }}</span>`,
})
export class StatusBadgeComponent {
  @Input() status = '';

  get label(): string {
    const labels: Record<string, string> = {
      active: 'Actif', inactive: 'Inactif', maintenance: 'Maintenance', suspended: 'Suspendu',
      confirmed: 'Confirmé', pending: 'En attente', cancelled: 'Annulé', completed: 'Terminé',
      delivered: 'Livré', out_of_stock: 'Rupture',
      approved: 'Approuvé', rejected: 'Rejeté', processing: 'En cours',
      failed: 'Échoué',
    };
    return labels[this.status] ?? this.status;
  }

  get badgeClass(): string {
    const map: Record<string, string> = {
      active: 'badge--success', confirmed: 'badge--success', delivered: 'badge--success', completed: 'badge--success', approved: 'badge--success',
      pending: 'badge--warning', processing: 'badge--warning',
      inactive: 'badge--gray', cancelled: 'badge--gray', rejected: 'badge--error', failed: 'badge--error', suspended: 'badge--error',
      maintenance: 'badge--info', out_of_stock: 'badge--error',
    };
    return map[this.status] ?? 'badge--gray';
  }
}
