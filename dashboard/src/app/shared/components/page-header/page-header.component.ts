import { Component, Input, inject } from '@angular/core';
import { NgIf, Location } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="page-header">
      <button *ngIf="showBack" class="btn-back" (click)="location.back()">
        <span class="material-symbols-outlined">arrow_back</span>
        Retour
      </button>
      <div class="page-header__row">
        <div>
          <h1 class="page-header__title">{{ title }}</h1>
          <p class="page-header__subtitle" *ngIf="subtitle">{{ subtitle }}</p>
        </div>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  public location = inject(Location);
  @Input() title = '';
  @Input() subtitle = '';
  @Input() showBack = false;
}
