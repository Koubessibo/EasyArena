import { Component, inject, signal, computed } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldOwnerService } from '../../../core/services/field-owner.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ExportService } from '../../../core/services/export.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { ScheduleEditorComponent } from './schedule-editor/schedule-editor.component';
import { DayBlockerComponent } from './day-blocker/day-blocker.component';
import { SlotBlockerComponent } from './slot-blocker/slot-blocker.component';

type ViewMode = 'month' | 'week' | 'day' | 'list';
type PageTab = 'calendar' | 'horaire' | 'blocages';

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, PageHeaderComponent, StatusBadgeComponent, FcfaPipe, ScheduleEditorComponent, DayBlockerComponent, SlotBlockerComponent],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
})
export class ScheduleComponent {
  private svc = inject(FieldOwnerService);
  private pdfExport = inject(PdfExportService);
  private exportService = inject(ExportService);
  bookings = this.svc.bookings;
  fields = this.svc.fields;

  pageTab = signal<PageTab>('calendar');

  get activeFieldId(): string {
    return this.fields()[0]?.id ?? '';
  }

  filterStartDate = signal('');
  filterEndDate = signal('');

  filteredBookings = computed(() => {
    let list = this.bookings().filter(b => b.status === 'confirmed');
    const start = this.filterStartDate();
    const end = this.filterEndDate();
    if (start) list = list.filter(b => b.date >= start);
    if (end) list = list.filter(b => b.date <= end);
    return list;
  });
  viewMode = signal<ViewMode>('week');

  constructor() {
    this.svc.loadBookings();
    this.svc.loadFields();
  }
  selectedDate = signal(new Date('2026-03-09'));
  today = new Date();

  readonly hours = computed(() => {
    const bookings = this.filteredBookings();
    let minHour = 7;
    let maxHour = 20;
    for (const b of bookings) {
      const startH = parseInt(b.startTime.split(':')[0], 10);
      const endH = parseInt(b.endTime.split(':')[0], 10);
      if (startH < minHour) minHour = startH;
      if (endH > maxHour) maxHour = endH;
    }
    return Array.from({ length: maxHour - minHour + 1 }, (_, i) => i + minHour);
  });

  readonly weekDays = computed(() => {
    const base = this.selectedDate();
    const monday = new Date(base);
    monday.setDate(base.getDate() - base.getDay() + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  });

  readonly monthDays = computed(() => {
    const base = this.selectedDate();
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    const startPad = (firstDay.getDay() + 6) % 7; // Monday = 0
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  });

  dateStr(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  bookingsForDate(date: Date): typeof this.bookings extends () => infer T ? T : never {
    const str = this.dateStr(date);
    return this.filteredBookings().filter(b => b.date === str) as any;
  }

  bookingsForHour(hour: number): typeof this.bookings extends () => infer T ? T : never {
    const str = this.dateStr(this.selectedDate());
    return this.filteredBookings().filter(b => {
      const start = parseInt(b.startTime.split(':')[0]);
      return b.date === str && start === hour;
    }) as any;
  }

  navigate(dir: -1 | 1): void {
    const d = new Date(this.selectedDate());
    if (this.viewMode() === 'week') d.setDate(d.getDate() + dir * 7);
    else if (this.viewMode() === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir);
    this.selectedDate.set(d);
  }

  readonly dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  readonly monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  exportPdf(): void {
    this.pdfExport.exportReservations(this.filteredBookings());
  }

  exportExcel(): void {
    const headers = ['Prénom', 'Nom', 'Téléphone', 'Terrain', 'Date', 'Horaire', 'Montant terrain (FCFA)', 'Montant payé (FCFA)', 'Statut'];
    const rows = this.filteredBookings().map(b => [
      b.firstName,
      b.lastName,
      b.clientPhone,
      b.fieldName,
      b.date,
      `${b.startTime} - ${b.endTime}`,
      b.amount,
      b.paidAmount,
      b.status,
    ]);
    this.exportService.exportToExcel('Réservations', headers, rows, `reservations-${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  clearFilter(): void {
    this.filterStartDate.set('');
    this.filterEndDate.set('');
  }

  formatHeader(): string {
    const d = this.selectedDate();
    if (this.viewMode() === 'month') return `${this.monthNames[d.getMonth()]} ${d.getFullYear()}`;
    if (this.viewMode() === 'week') {
      const days = this.weekDays();
      return `${days[0].getDate()} – ${days[6].getDate()} ${this.monthNames[days[0].getMonth()]} ${days[0].getFullYear()}`;
    }
    return `${d.getDate()} ${this.monthNames[d.getMonth()]} ${d.getFullYear()}`;
  }
}
