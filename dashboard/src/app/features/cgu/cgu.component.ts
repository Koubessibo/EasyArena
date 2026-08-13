import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cgu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cgu.component.html',
  styleUrls: ['./cgu.component.scss']
})
export class CguComponent {
  activeTab = signal<'client' | 'owner' | 'vendor'>('owner');
}
