import { Component, inject } from '@angular/core';
import { NgFor, NgClass } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';

/**
 * Pile de toasts in-app.
 *
 * Rendu unique dans le layout : le service est la seule source d'entrée.
 * Seules les priorités `action` et `info` arrivent ici (`digest` est filtré
 * amont dans `NotificationService.pushToast`).
 *
 * Chaque toast est cliquable : il bascule en « lu » puis ouvre le `link`
 * fourni par l'API — un seul geste, jamais de destination fantôme.
 */
@Component({
  selector: 'app-notification-toast',
  standalone: true,
  imports: [NgFor, NgClass],
  template: `
    <div class="nto" aria-live="polite" aria-atomic="false">
      <div
        *ngFor="let t of notifService.toasts()"
        class="nto__item"
        [class.nto__item--action]="t.priority === 'action'"
        role="button"
        tabindex="0"
        (click)="notifService.open(t)"
        (keyup.enter)="notifService.open(t)"
      >
        <span class="nto__icon" [ngClass]="t.priority === 'action' ? 'nto__icon--action' : 'nto__icon--info'">
          <span class="material-symbols-outlined">{{ iconFor(t.type) }}</span>
        </span>

        <span class="nto__body">
          <span class="nto__title">{{ t.title || 'Notification' }}</span>
          <span class="nto__msg">{{ t.message }}</span>
        </span>

        <button
          type="button"
          class="nto__close"
          aria-label="Fermer"
          (click)="notifService.dismissToast(t.toastId); $event.stopPropagation()"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        z-index: 1200;
        top: 76px;
        right: 16px;
        left: auto;
        display: block;
        pointer-events: none;
      }

      @media (max-width: 768px) {
        :host {
          top: auto;
          right: 12px;
          bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 12px);
          left: 12px;
        }
      }

      .nto {
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
        pointer-events: none;
      }

      .nto__item {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 12px 14px;
        color: #fff;
        background: #16211c;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-left: 3px solid #38bdf8;
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        cursor: pointer;
        pointer-events: auto;
        animation: nto-in 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
      }

      .nto__item--action {
        border-left-color: #fbbf24;
      }

      .nto__item:focus-visible {
        outline: 2px solid #38bdf8;
        outline-offset: 2px;
      }

      .nto__icon {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        border-radius: 8px;
        background: rgba(56, 189, 248, 0.16);
      }

      .nto__icon--action {
        background: rgba(251, 191, 36, 0.18);
        color: #fbbf24;
      }

      .nto__icon--info {
        color: #7dd3fc;
      }

      .nto__icon .material-symbols-outlined {
        font-size: 19px;
      }

      .nto__body {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      .nto__title {
        font-size: 13.5px;
        font-weight: 650;
        line-height: 1.3;
      }

      .nto__msg {
        font-size: 12.5px;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.72);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .nto__close {
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        flex: 0 0 26px;
        padding: 0;
        color: rgba(255, 255, 255, 0.6);
        background: transparent;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
      }

      .nto__close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      .nto__close .material-symbols-outlined {
        font-size: 17px;
      }

      @keyframes nto-in {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .nto__item {
          animation: none;
        }
      }
    `,
  ],
})
export class NotificationToastComponent {
  readonly notifService = inject(NotificationService);

  /** Petit vocabulaire d'icônes : au-delà, `notifications` par défaut. */
  iconFor(type: string): string {
    if (type.startsWith('booking') || type.startsWith('cancellation')) return 'event_available';
    if (type.startsWith('payment') || type.startsWith('withdrawal') || type.startsWith('commission')) return 'payments';
    if (type.startsWith('order') || type === 'stock_low') return 'shopping_bag';
    if (type.startsWith('subscription')) return 'card_membership';
    if (type.startsWith('field')) return 'sports_soccer';
    if (type.startsWith('enrollment') || type.startsWith('admin')) return 'shield_person';
    if (type.startsWith('ticket')) return 'confirmation_number';
    return 'notifications';
  }
}
