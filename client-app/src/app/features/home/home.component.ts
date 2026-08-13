import { Component, signal, inject, OnInit, OnDestroy, AfterViewInit, computed, NgZone } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor, DecimalPipe, TitleCasePipe } from '@angular/common';
import { FieldService } from '../../core/services/field.service';
import { AuthService } from '../../core/services/auth.service';
import { Field, SportCategory } from '../../core/models/field.model';
import { FieldCardComponent } from '../../shared/components/field-card/field-card.component';
import { CartService } from '../../core/services/cart.service';

interface SportTab {
  label: string;
  value: SportCategory | 'all';
  icon: string;
  color: string;
}

interface HeroSlide {
  imageUrl: string;
  tag: string;
  headline: string;
  sub: string;
  cta: string;
  ctaLink: string;
  accent: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, DecimalPipe, TitleCasePipe, FieldCardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  private fieldService = inject(FieldService);
  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private zone = inject(NgZone);

  readonly currentUser = this.authService.currentUser;
  readonly cartCount = computed(() => this.cartService.count());

  activeTab = signal<SportCategory | 'all'>('all');
  featuredFields = signal<Field[]>([]);
  allFields = signal<Field[]>([]);
  filteredFields = signal<Field[]>([]);
  loading = signal(true);
  howItWorksTab = signal<'players' | 'owners'>('players');
  openFaqIndex = signal<number | null>(0);

  readonly howItWorksPlayers = [
    {
      step: '01',
      icon: 'search',
      title: '1. Trouvez votre terrain',
      desc: 'Explorez la carte et filtrez par quartier, sport, tarif horaire ou équipements (éclairage LED, vestiaires, gazon synthétique).',
      badge: 'Géolocalisation & Filtres',
      color: '#10b981'
    },
    {
      step: '02',
      icon: 'account_balance_wallet',
      title: '2. Réservez & Payez en 30s',
      desc: 'Sélectionnez votre créneau et payez en toute sécurité via Wave, Orange Money ou Free. Transparence totale des 5% de frais.',
      badge: 'Paiement Sécurisé Samir Money',
      color: '#06b6d4'
    },
    {
      step: '03',
      icon: 'qr_code_2',
      title: '3. Présentez votre QR Code',
      desc: 'Votre Billet numérique avec QR Code est généré instantanément. Accessible dans votre téléphone même sans connexion réseau.',
      badge: 'Billet Hors-Ligne Mode PWA',
      color: '#8b5cf6'
    }
  ];

  readonly howItWorksOwners = [
    {
      step: '01',
      icon: 'stadium',
      title: '1. Configurez vos terrains',
      desc: 'Ajoutez vos complexes, définissez les tarifs horaires, acomptes requis et plages d\'ouverture.',
      badge: 'Gestion Multi-terrains',
      color: '#f59e0b'
    },
    {
      step: '02',
      icon: 'calendar_month',
      title: '2. Pilotez vos réservations',
      desc: 'Visualisez le planning en direct, bloquez des créneaux exceptionnels et assignez vos contrôleurs de billets.',
      badge: 'Planning Automatisé',
      color: '#10b981'
    },
    {
      step: '03',
      icon: 'payments',
      title: '3. Encaissez à 0% de frais',
      desc: 'Demandez vos retraits vers Wave ou Orange Money. EasyArena prend en charge 100% des frais de retrait.',
      badge: 'Retraits Mobile Money 0%',
      color: '#ec4899'
    }
  ];

  readonly reassuranceItems = [
    {
      icon: 'verified_user',
      title: 'Paiements Agrées BCEAO',
      desc: 'Transactions sécurisées par Samir Money, établissement de paiement agréé.',
      color: '#10b981'
    },
    {
      icon: 'bolt',
      title: 'Billet QR Instantané',
      desc: 'Confirmation et passe d\'accès générés en moins de 30 secondes.',
      color: '#f59e0b'
    },
    {
      icon: 'phonelink_ring',
      title: 'App PWA Hors-Ligne',
      desc: 'Vos billets restent affichables sur votre écran sans connexion internet.',
      color: '#8b5cf6'
    },
    {
      icon: 'published_with_changes',
      title: 'Annulation Transparente',
      desc: 'Remboursement direct des créneaux annulés selon nos CGU vérifiées.',
      color: '#06b6d4'
    },
    {
      icon: 'support_agent',
      title: 'Support 7j/7 en Direct',
      desc: 'Une équipe locale joignable par WhatsApp et téléphone à Dakar.',
      color: '#ec4899'
    }
  ];

  readonly testimonials = [
    {
      quote: "La qualité des complexes disponibles est excellente. La simplicité et la rapidité du processus sont top.",
      author: "Abdou Diallo",
      role: "Entraîneur amateur",
      activityBadge: "9 réservations",
      avatar: "A",
      rating: 5
    },
    {
      quote: "EasyArena a complètement changé ma façon de réserver. Plus besoin d'appeler. Tout se fait en quelques clics !",
      author: "Modou Samb",
      role: "Joueur amateur",
      activityBadge: "12 réservations",
      avatar: "M",
      rating: 5
    },
    {
      quote: "En tant que gestionnaire, EasyArena m'a permis d'augmenter mes réservations de 40% et de réduire les annulations.",
      author: "Mame Cheikh Ndiaye",
      role: "Manager de complexe",
      activityBadge: "Manager vérifié",
      avatar: "C",
      rating: 5
    }
  ];

  readonly faqs = [
    {
      q: "Comment se passe la confirmation de réservation ?",
      a: "Dès la validation de votre paiement via Mobile Money (Wave, Orange Money, Free), un Billet QR Code est généré et stocké dans votre application. Il est immédiatement scannable et consultable même si vous n'avez pas de réseau internet."
    },
    {
      q: "Quels sont les frais appliqués sur les réservations ?",
      a: "Conformément à nos CGU, chaque réservation comporte des frais de service transparents de 5 % prélevés par EasyArena pour financer la plateforme et le support client 7j/7."
    },
    {
      q: "Puis-je annuler une réservation et être remboursé ?",
      a: "Oui, vous pouvez demander l'annulation de votre réservation depuis votre espace client. En cas de validation, le remboursement principal est versé sur votre compte Wave ou Orange Money."
    },
    {
      q: "Quels sont les avantages de l'application PWA ?",
      a: "L'application PWA s'installe directement sur votre écran d'accueil sans passer par le Play Store (0 Mo requis). Elle s'ouvre instantanément et garde vos billets QR disponibles même sans réseau."
    },
    {
      q: "Comment devenir propriétaire ou vendeur partenaire sur EasyArena ?",
      a: "Cliquez sur 'Créer un compte' en haut de la page, choisissez le rôle 'Propriétaire' ou 'Vendeur' et remplissez le formulaire. Notre équipe commerciale valide votre demande sous 24 heures."
    }
  ];

  toggleFaq(index: number): void {
    if (this.openFaqIndex() === index) {
      this.openFaqIndex.set(null);
    } else {
      this.openFaqIndex.set(index);
    }
  }

  switchHowTab(tab: 'players' | 'owners'): void {
    this.howItWorksTab.set(tab);
    setTimeout(() => {
      document.querySelectorAll('.step-card').forEach(el => el.classList.add('is-revealed'));
    }, 20);
  }

  searchQuery = signal('');
  heroIndex = signal(0);
  heroAnimating = signal(false);

  private heroTimer?: ReturnType<typeof setInterval>;

  readonly heroSlides: HeroSlide[] = [
    {
      imageUrl: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=1600&auto=format&fit=crop&q=80',
      tag: '⚽ Football',
      headline: 'Réservez votre\nterrain en 30s',
      sub: 'Plus de 40 complexes sportifs premium disponibles à Dakar, Thiès et Saint-Louis.',
      cta: 'Trouver un terrain',
      ctaLink: '/home',
      accent: '#10b981',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1600&auto=format&fit=crop&q=80',
      tag: '🏀 Basketball',
      headline: 'Des courts NBA\nà portée de main',
      sub: 'Courts de basketball flambant neufs avec parquet ou bitume, éclairage LED nuit.',
      cta: 'Voir les courts',
      ctaLink: '/home',
      accent: '#f59e0b',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1600&auto=format&fit=crop&q=80',
      tag: '🎾 Tennis & Padel',
      headline: 'L\'élite du sport\nau Sénégal',
      sub: 'Courts en terre battue et gazon synthétique. Réservation instantanée, paiement Mobile Money.',
      cta: 'Réserver maintenant',
      ctaLink: '/home',
      accent: '#8b5cf6',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=1600&auto=format&fit=crop&q=80',
      tag: '🏆 Événements',
      headline: 'Achetez vos\nbillets de match',
      sub: 'Tournois locaux, championnats inter-quartiers, coupes. Ne ratez aucun événement sportif.',
      cta: 'Voir les événements',
      ctaLink: '/events',
      accent: '#ef4444',
    },
  ];

  readonly sportTabs: SportTab[] = [
    { label: 'Tous', value: 'all', icon: 'sports', color: '#10b981' },
    { label: 'Football', value: 'football', icon: 'sports_soccer', color: '#10b981' },
    { label: 'Basketball', value: 'basketball', icon: 'sports_basketball', color: '#f59e0b' },
    { label: 'Tennis', value: 'tennis', icon: 'sports_tennis', color: '#8b5cf6' },
    { label: 'Padel', value: 'padel', icon: 'sports_tennis', color: '#06b6d4' },
  ];

  readonly stats = [
    { num: '40+', label: 'Terrains', icon: 'stadium' },
    { num: '5', label: 'Villes', icon: 'location_city' },
    { num: '6', label: 'Sports', icon: 'emoji_events' },
    { num: '2K+', label: 'Joueurs', icon: 'group' },
  ];

  // Computed display lists that re-filter instantly when category tab changes
  readonly displayFeatured = computed(() => {
    const tab = this.activeTab();
    const list = this.allFields().length > 0 ? this.allFields() : this.featuredFields();
    if (tab === 'all') return list;
    return list.filter(f => this.matchesCategory(f, tab));
  });

  readonly displayNearby = computed(() => {
    const tab = this.activeTab();
    const list = this.filteredFields().length > 0 ? this.filteredFields() : this.allFields();
    if (tab === 'all') return list;
    return list.filter(f => this.matchesCategory(f, tab));
  });

  private matchesCategory(f: Field, tab: string): boolean {
    if (tab === 'all') return true;
    const sport = (f.sport || '').toLowerCase();
    const name = (f.name || '').toLowerCase();

    if (tab === 'padel') return sport === 'padel' || name.includes('padel');
    if (tab === 'tennis') return sport === 'tennis' || name.includes('tennis');
    if (tab === 'basketball') return sport === 'basketball' || name.includes('basket') || name.includes('basketball');
    if (tab === 'football') return sport === 'football' || name.includes('foot') || name.includes('soccer');
    
    return sport === tab;
  }

  get activeTabLabel(): string {
    const found = this.sportTabs.find(t => t.value === this.activeTab());
    return found ? found.label : 'Tous';
  }

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  get firstName(): string {
    return this.currentUser()?.fullName?.split(' ')[0] || 'Sportif';
  }

  get currentSlide(): HeroSlide {
    return this.heroSlides[this.heroIndex()];
  }

  ngOnInit(): void {
    this.loading.set(true);
    
    this.fieldService.getFields().subscribe({
      next: (fields) => {
        this.allFields.set(fields);
        this.featuredFields.set(fields.slice(0, 6));
        this.filteredFields.set(fields);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });

    // Auto-advance hero every 5.5s
    this.zone.runOutsideAngular(() => {
      this.heroTimer = setInterval(() => {
        this.zone.run(() => this.nextHero());
      }, 5500);
    });
  }

  ngOnDestroy(): void {
    if (this.heroTimer) clearInterval(this.heroTimer);
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    setTimeout(() => {
      const targets = document.querySelectorAll('.section, .step-card, .reassurance-card, .testimonial-card, .faq-item, .home-cta-card, .promo-banner');
      targets.forEach(el => observer.observe(el));
    }, 200);
  }

  goToSlide(idx: number): void {
    if (idx === this.heroIndex()) return;
    this.heroAnimating.set(true);
    setTimeout(() => {
      this.heroIndex.set(idx);
      this.heroAnimating.set(false);
    }, 300);
  }

  nextHero(): void {
    const next = (this.heroIndex() + 1) % this.heroSlides.length;
    this.goToSlide(next);
  }

  prevHero(): void {
    const prev = (this.heroIndex() - 1 + this.heroSlides.length) % this.heroSlides.length;
    this.goToSlide(prev);
  }

  isFavorite(fieldId: string): boolean {
    return this.fieldService.isFavorite(fieldId);
  }

  toggleFavorite(fieldId: string): void {
    this.fieldService.toggleFavorite(fieldId);
  }

  selectTab(tab: SportCategory | 'all'): void {
    this.activeTab.set(tab);
    const sport = tab === 'all' ? undefined : tab;
    this.fieldService.getFields(sport).subscribe(fields => {
      if (fields && fields.length > 0) {
        this.filteredFields.set(fields);
      } else {
        // Fallback to local filter over allFields if backend returns unmapped list
        const localFiltered = this.allFields().filter(f => this.matchesCategory(f, tab));
        this.filteredFields.set(localFiltered);
      }
    });
  }
}
