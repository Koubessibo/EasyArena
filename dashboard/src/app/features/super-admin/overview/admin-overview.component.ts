import { Component, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';

@Component({
  selector: 'app-admin-overview',
  standalone: true,
  imports: [NgFor, RouterLink, StatCardComponent, PageHeaderComponent, FcfaPipe],
  templateUrl: './admin-overview.component.html',
  styleUrl: './admin-overview.component.scss',
})
export class AdminOverviewComponent {
  private adminService = inject(AdminService);
  stats = this.adminService.stats;
  monthlyRevenue = this.adminService.monthlyRevenue;
  pendingUsers = this.adminService.pendingUsers;

  constructor() {
    this.adminService.loadStats();
    this.adminService.loadPendingUsers();
    this.adminService.loadMonthlyRevenue();
  }

  get maxRevenue(): number {
    const vals = this.monthlyRevenue().map(m => m.value);
    return vals.length ? Math.max(...vals) : 1;
  }

  getBarHeight(value: number): number {
    return Math.round((value / this.maxRevenue) * 100);
  }
}
