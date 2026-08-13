import { Component, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-prompt',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './auth-prompt.component.html',
  styleUrl: './auth-prompt.component.scss',
})
export class AuthPromptComponent {
  @Input() message = 'pour continuer';
  @Output() dismissed = new EventEmitter<void>();

  dismiss(): void {
    this.dismissed.emit();
  }
}
