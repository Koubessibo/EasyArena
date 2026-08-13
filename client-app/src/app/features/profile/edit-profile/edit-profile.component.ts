import { Component, signal, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/user.model';
import { PhoneInputComponent } from '../../../shared/components/phone-input/phone-input.component';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [NgIf, FormsModule, PhoneInputComponent],
  templateUrl: './edit-profile.component.html',
  styleUrl: './edit-profile.component.scss',
})
export class EditProfileComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private authService = inject(AuthService);
  private router = inject(Router);

  // Profile info
  fullName   = signal('');
  email      = signal('');
  phone      = signal('');

  // Avatar
  avatarPreview = signal<string | null>(null);
  avatarFile    = signal<File | null>(null);
  avatarUploading = signal(false);

  // PIN change
  showPinSection = signal(false);
  currentPin     = signal('');
  newPin         = signal('');
  confirmPin     = signal('');
  pinLoading     = signal(false);
  pinSuccess     = signal(false);
  pinError       = signal('');

  // State
  loading      = signal(false);
  showToast    = signal(false);
  toastMessage = signal('');
  errorMessage = signal('');

  get currentUser(): User | null { return this.authService.currentUser(); }
  get storedAvatarUrl(): string  { return this.authService.currentUser()?.avatarUrl || ''; }

  get initials(): string {
    const name = this.authService.currentUser()?.fullName || '';
    return name.split(' ').map(n => n.charAt(0)).join('').slice(0, 2).toUpperCase();
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.fullName.set(user.fullName || '');
      this.email.set(user.email || '');
      this.phone.set(user.phone || '');
    }
  }

  goBack(): void { this.router.navigate(['/profile']); }

  // ── Avatar ─────────────────────────────────────────────────────────
  triggerFileInput(): void { this.fileInput.nativeElement.click(); }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    // Validate type and size (max 5 MB)
    if (!file.type.startsWith('image/')) {
      this.showError('Veuillez sélectionner une image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.showError('L\'image ne doit pas dépasser 5 Mo.');
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = e => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
    this.avatarFile.set(file);

    // Upload immediately
    this.avatarUploading.set(true);
    this.authService.uploadAvatar(file).subscribe({
      next: () => {
        this.avatarUploading.set(false);
        this.toast('Photo de profil mise à jour !');
      },
      error: () => {
        this.avatarUploading.set(false);
        this.avatarPreview.set(null);
        this.avatarFile.set(null);
        this.showError('Erreur lors de l\'envoi de la photo.');
      },
    });
  }

  // ── Profile save ────────────────────────────────────────────────────
  onSave(): void {
    if (!this.fullName().trim()) {
      this.showError('Le nom est obligatoire.');
      return;
    }
    if (this.email().trim() && !this.isValidEmail(this.email())) {
      this.showError('Adresse e-mail invalide.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const parts = this.fullName().trim().split(' ');
    const firstName = parts[0] ?? '';
    const lastName  = parts.slice(1).join(' ') || undefined;

    this.authService.updateProfile({ firstName, lastName, email: this.email() || undefined }).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast('Profil mis à jour avec succès !');
      },
      error: () => {
        this.loading.set(false);
        this.showError('Une erreur est survenue. Veuillez réessayer.');
      },
    });
  }

  // ── PIN change ──────────────────────────────────────────────────────
  togglePinSection(): void {
    this.showPinSection.update(v => !v);
    this.currentPin.set('');
    this.newPin.set('');
    this.confirmPin.set('');
    this.pinError.set('');
    this.pinSuccess.set(false);
  }

  onChangePin(): void {
    this.pinError.set('');
    if (this.currentPin().length < 4) { this.pinError.set('Code actuel incomplet.'); return; }
    if (this.newPin().length < 4)     { this.pinError.set('Nouveau code trop court (4 chiffres min).'); return; }
    if (this.newPin() !== this.confirmPin()) { this.pinError.set('Les codes ne correspondent pas.'); return; }

    this.pinLoading.set(true);
    this.authService.updatePin(this.currentPin(), this.newPin()).subscribe({
      next: () => {
        this.pinLoading.set(false);
        this.pinSuccess.set(true);
        this.currentPin.set('');
        this.newPin.set('');
        this.confirmPin.set('');
        setTimeout(() => { this.pinSuccess.set(false); this.showPinSection.set(false); }, 2500);
      },
      error: (err: Error) => {
        this.pinLoading.set(false);
        this.pinError.set(err.message || 'Code actuel incorrect.');
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private showError(msg: string): void { this.errorMessage.set(msg); }

  private toast(msg: string): void {
    this.toastMessage.set(msg);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 3000);
  }
}
