import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BookingSlot } from '../models/field.model';

const BRAND_GREEN: [number, number, number] = [34, 197, 94];
const BRAND_GREEN_LIGHT: [number, number, number] = [240, 253, 244];
const GRAY: [number, number, number] = [120, 120, 120];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fcfa(amount: number): string {
  return Number(amount).toLocaleString('fr-FR') + ' F';
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {

  exportReservations(bookings: BookingSlot[]): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    // A4 landscape = 297mm wide, 210mm tall

    const confirmed = bookings
      .filter(b => b.status === 'confirmed')
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Header band ──────────────────────────────────────────────────────────
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, 297, 32, 'F');

    // Logo circle
    doc.setFillColor(255, 255, 255);
    doc.circle(20, 16, 9, 'F');
    doc.setTextColor(...BRAND_GREEN);
    doc.setFontSize(10).setFont('helvetica', 'bold');
    doc.text('EA', 20, 18.5, { align: 'center' });

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18).setFont('helvetica', 'bold');
    doc.text('EasyArena', 34, 13);
    doc.setFontSize(10).setFont('helvetica', 'normal');
    doc.text('Tableau des Réservations', 34, 21);

    // Export date — top right
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFontSize(8).setFont('helvetica', 'italic');
    doc.text(`Exporté le ${today}`, 283, 11, { align: 'right' });
    doc.setFontSize(8).setFont('helvetica', 'normal');
    doc.text(`${confirmed.length} réservation(s) confirmée(s)`, 283, 19, { align: 'right' });

    // ── Separator ─────────────────────────────────────────────────────────────
    doc.setDrawColor(...BRAND_GREEN);
    doc.setLineWidth(0.5);
    doc.line(14, 36, 283, 36);

    // ── Table ─────────────────────────────────────────────────────────────────
    const rows = confirmed.map((b, i) => [
      String(i + 1),
      b.firstName,
      b.lastName,
      b.clientPhone,
      b.fieldName,
      formatDate(b.date),
      `${b.startTime} – ${b.endTime}`,
      fcfa(b.amount),
      fcfa(b.paidAmount),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['N°', 'Prénom', 'Nom', 'Téléphone', 'Terrain', 'Date', 'Heure', 'Montant terrain', 'Montant payé']],
      body: rows.length > 0 ? rows : [['', 'Aucune réservation confirmée', '', '', '', '', '', '', '']],
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3.5,
        lineColor: [220, 220, 220],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: BRAND_GREEN_LIGHT,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12, fontStyle: 'bold' },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 40 },
        5: { cellWidth: 24, halign: 'center' },
        6: { cellWidth: 32, halign: 'center' },
        7: { cellWidth: 32, halign: 'right' },
        8: { cellWidth: 32, halign: 'right' },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();

        doc.setDrawColor(...BRAND_GREEN);
        doc.setLineWidth(0.4);
        doc.line(14, 200, 283, 200);

        doc.setFontSize(8).setTextColor(...GRAY).setFont('helvetica', 'normal');
        doc.text(`Total : ${confirmed.length} réservation(s) confirmée(s)`, 14, 206);
        doc.text('EasyArena — Plateforme de réservation de terrains', 148, 206, { align: 'center' });
        doc.text(`Page ${data.pageNumber} / ${pageCount}`, 283, 206, { align: 'right' });
      },
    });

    const filename = `reservations-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  }
}
