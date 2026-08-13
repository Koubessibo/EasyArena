import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pwa-install',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pwa-install.component.html',
  styleUrls: ['./pwa-install.component.scss']
})
export class PwaInstallComponent implements OnInit {
  activeTab = signal<'android' | 'ios' | 'desktop'>('android');
  isStandalone = signal(false);
  deferredPrompt = signal<any>(null);
  installedSuccess = signal(false);

  ngOnInit(): void {
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      this.isStandalone.set(true);
    }

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      this.activeTab.set('ios');
    } else if (ua.includes('android')) {
      this.activeTab.set('android');
    } else {
      this.activeTab.set('desktop');
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt.set(e);
    });
  }

  installPwa(): void {
    const prompt = this.deferredPrompt();
    if (prompt) {
      prompt.prompt();
      prompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          this.installedSuccess.set(true);
        }
        this.deferredPrompt.set(null);
      });
    } else {
      alert("Suivez les instructions visuelles ci-dessous pour installer l'application sur votre écran d'accueil !");
    }
  }
}
