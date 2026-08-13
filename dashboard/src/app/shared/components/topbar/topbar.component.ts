import { Component, Output, EventEmitter, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [NgIf],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  @Output() openMobileSidebar = new EventEmitter<void>();
  private auth = inject(AuthService);
  user = this.auth.currentUser;
  userMenuOpen = signal(false);

  get initials(): string {
    const name = this.user()?.name ?? '';
    return name.split(' ').map(n => n.charAt(0)).join('').slice(0, 2).toUpperCase() || 'U';
  }

  logout(): void { this.auth.promptLogout(); }
}
