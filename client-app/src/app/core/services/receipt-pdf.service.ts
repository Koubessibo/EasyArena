import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Booking } from '../models/booking.model';

const BRAND_GREEN: [number, number, number] = [34, 197, 94];
const BRAND_GREEN_LIGHT: [number, number, number] = [240, 253, 244];
const GRAY: [number, number, number] = [120, 120, 120];

@Injectable({ providedIn: 'root' })
export class ReceiptPdfService {

  generateReceipt(booking: Booking): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Header band ──────────────────────────────────────────────────────────
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, 210, 32, 'F');

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
    doc.text('Reçu de réservation', 34, 21);

    // Date top right
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFontSize(8).setFont('helvetica', 'italic');
    doc.text(`Généré le ${today}`, 196, 11, { align: 'right' });

    // Reference top right
    const ref = `#${booking.id.slice(0, 8).toUpperCase()}`;
    doc.setFontSize(8).setFont('helvetica', 'bold');
    doc.text(`Réf: ${ref}`, 196, 19, { align: 'right' });

    // ── Separator ────────────────────────────────────────────────────────────
    doc.setDrawColor(...BRAND_GREEN);
    doc.setLineWidth(0.5);
    doc.line(14, 36, 196, 36);

    // ── Booking details section ──────────────────────────────────────────────
    let y = 44;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13).setFont('helvetica', 'bold');
    doc.text('Détails de la réservation', 14, y);
    y += 10;

    const details = [
      ['Terrain', booking.fieldName],
      ['Adresse', booking.fieldAddress || 'N/A'],
      ['Date', this.formatDate(booking.date)],
      ['Horaire', `${booking.startTime} — ${booking.endTime}`],
      ['Durée', `${booking.pricing.durationHours}h`],
    ];

    doc.setFontSize(10);
    for (const [label, value] of details) {
      doc.setFont('helvetica', 'bold').setTextColor(...GRAY);
      doc.text(label, 14, y);
      doc.setFont('helvetica', 'normal').setTextColor(0, 0, 0);
      doc.text(value, 60, y);
      y += 7;
    }

    // ── Pricing table ────────────────────────────────────────────────────────
    y += 6;
    doc.setFontSize(13).setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text('Détail du paiement', 14, y);
    y += 4;

    const pricingRows: string[][] = [
      ['Tarif horaire', `${this.formatFcfa(booking.pricing.hourlyRate)} / h`],
      [`Sous-total (${booking.pricing.durationHours}h)`, this.formatFcfa(booking.pricing.subtotal)],
      ['Frais de service', this.formatFcfa(booking.pricing.serviceFee)],
    ];

    autoTable(doc, {
      startY: y,
      body: pricingRows,
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 4,
        lineColor: [220, 220, 220],
        lineWidth: 0.3,
      },
      alternateRowStyles: { fillColor: BRAND_GREEN_LIGHT },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { halign: 'right', cellWidth: 62 },
      },
      didDrawPage: () => {},
    });

    // Total row
    const afterTable = (doc as any).lastAutoTable.finalY + 2;
    autoTable(doc, {
      startY: afterTable,
      body: [['TOTAL', this.formatFcfa(booking.pricing.total)]],
      styles: {
        font: 'helvetica',
        fontSize: 12,
        fontStyle: 'bold',
        cellPadding: 5,
        lineColor: [220, 220, 220],
        lineWidth: 0.3,
      },
      bodyStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { halign: 'right', cellWidth: 62 },
      },
      didDrawPage: () => {},
    });

    // ── Payment info ─────────────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 12;
    doc.setFontSize(13).setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text('Informations de paiement', 14, y);
    y += 10;

    const methodLabels: Record<string, string> = {
      wave: 'Wave',
      orange_money: 'Orange Money',
      free_money: 'Free Money',
      mtn_mobile_money: 'MTN Mobile Money',
      bank_card: 'Carte bancaire',
    };
    const statusLabels: Record<string, string> = {
      paid: 'Payé',
      pending: 'En attente',
      failed: 'Échoué',
      refunded: 'Remboursé',
    };

    const paymentDetails = [
      ['Méthode', methodLabels[booking.payment.method] ?? booking.payment.method],
      ['Statut', statusLabels[booking.payment.status] ?? booking.payment.status],
    ];
    if (booking.payment.transactionId) {
      paymentDetails.push(['ID Transaction', booking.payment.transactionId]);
    }
    if (booking.payment.paidAt) {
      paymentDetails.push(['Date de paiement', new Date(booking.payment.paidAt).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })]);
    }

    doc.setFontSize(10);
    for (const [label, value] of paymentDetails) {
      doc.setFont('helvetica', 'bold').setTextColor(...GRAY);
      doc.text(label, 14, y);
      doc.setFont('helvetica', 'normal').setTextColor(0, 0, 0);
      doc.text(value, 60, y);
      y += 7;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.setDrawColor(...BRAND_GREEN);
    doc.setLineWidth(0.4);
    doc.line(14, 284, 196, 284);

    doc.setFontSize(8).setTextColor(...GRAY).setFont('helvetica', 'normal');
    doc.text(`Réf: ${ref}`, 14, 290);
    doc.text('EasyArena — Plateforme de réservation de terrains', 105, 290, { align: 'center' });
    doc.text(`Page 1 / 1`, 196, 290, { align: 'right' });

    // Save
    const filename = `recu-${booking.id.slice(0, 8)}.pdf`;
    doc.save(filename);
  }

  private formatDate(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  private formatFcfa(amount: number): string {
    return `${amount.toLocaleString('fr-FR')} FCFA`;
  }
}
