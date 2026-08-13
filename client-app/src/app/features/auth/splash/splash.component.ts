import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';

interface OnboardingSlide {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.scss',
})
export class SplashComponent {
  private router = inject(Router);

  currentSlide = signal(0);
  animating = signal(false);

  readonly slides: OnboardingSlide[] = [
    {
      icon: 'stadium',
      title: 'Réservez votre terrain',
      description: 'Trouvez et réservez des terrains de sport près de chez vous en quelques clics.',
    },
    {
      icon: 'shopping_bag',
      title: 'Équipez-vous',
      description: 'Achetez du matériel sportif de qualité auprès de vendeurs certifiés.',
    },
    {
      icon: 'groups',
      title: 'Rejoignez la communauté',
      description: 'Connectez-vous avec d\'autres sportifs et organisez vos événements.',
    },
  ];

  get isLastSlide(): boolean {
    return this.currentSlide() === this.slides.length - 1;
  }

  get isFirstTwoSlides(): boolean {
    return this.currentSlide() < this.slides.length - 1;
  }

  nextSlide(): void {
    if (this.currentSlide() < this.slides.length - 1) {
      this.animating.set(true);
      setTimeout(() => {
        this.currentSlide.update(v => v + 1);
        this.animating.set(false);
      }, 200);
    }
  }

  goToSlide(index: number): void {
    if (index !== this.currentSlide()) {
      this.animating.set(true);
      setTimeout(() => {
        this.currentSlide.set(index);
        this.animating.set(false);
      }, 200);
    }
  }

  skip(): void {
    this.router.navigate(['/register']);
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }
}
