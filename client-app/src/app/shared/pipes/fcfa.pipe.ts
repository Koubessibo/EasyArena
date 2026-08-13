import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fcfa',
  standalone: true,
})
export class FcfaPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';

    // Format with space separator for thousands (French/African standard)
    const formatted = value.toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    return `${formatted} FCFA`;
  }
}
