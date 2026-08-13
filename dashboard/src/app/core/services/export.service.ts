import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const BRAND_GREEN: [number, number, number] = [34, 197, 94];
const BRAND_GREEN_LIGHT: [number, number, number] = [240, 253, 244];
const GRAY: [number, number, number] = [120, 120, 120];

@Injectable({ providedIn: 'root' })
export class ExportService {

  exportToPdf(
    title: string,
    headers: string[],
    rows: (string | number)[][],
    filename: string,
  ): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Header band ──────────────────────────────────────────────────────────
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, 210, 32, 'F');

    doc.setFillColor(255, 255, 255);
    doc.circle(20, 16, 9, 'F');
    doc.setTextColor(...BRAND_GREEN);
    doc.setFontSize(10).setFont('helvetica', 'bold');
    doc.text('EA', 20, 18.5, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18).setFont('helvetica', 'bold');
    doc.text('EasyArena', 34, 13);
    doc.setFontSize(10).setFont('helvetica', 'normal');
    doc.text(title, 34, 21);

    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFontSize(8).setFont('helvetica', 'italic');
    doc.text(`Exporté le ${today}`, 196, 11, { align: 'right' });

    doc.setFontSize(8).setFont('helvetica', 'normal');
    doc.text(`${rows.length} entrée(s)`, 196, 19, { align: 'right' });

    // ── Separator ────────────────────────────────────────────────────────────
    doc.setDrawColor(...BRAND_GREEN);
    doc.setLineWidth(0.5);
    doc.line(14, 36, 196, 36);

    // ── Table ────────────────────────────────────────────────────────────────
    const stringRows = rows.map(r => r.map(c => String(c)));

    autoTable(doc, {
      startY: 40,
      head: [headers],
      body: stringRows.length > 0 ? stringRows : [headers.map(() => '')],
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 4,
        lineColor: [220, 220, 220],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
      },
      alternateRowStyles: {
        fillColor: BRAND_GREEN_LIGHT,
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setDrawColor(...BRAND_GREEN);
        doc.setLineWidth(0.4);
        doc.line(14, 284, 196, 284);
        doc.setFontSize(8).setTextColor(...GRAY).setFont('helvetica', 'normal');
        doc.text(`Total : ${rows.length} entrée(s)`, 14, 290);
        doc.text('EasyArena — Plateforme de réservation de terrains', 105, 290, { align: 'center' });
        doc.text(`Page ${data.pageNumber} / ${pageCount}`, 196, 290, { align: 'right' });
      },
    });

    doc.save(filename);
  }

  exportToExcel(
    sheetName: string,
    headers: string[],
    rows: (string | number)[][],
    filename: string,
  ): void {
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }
}
