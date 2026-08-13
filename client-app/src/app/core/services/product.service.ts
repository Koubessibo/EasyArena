import { Injectable, signal, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { Product, ProductCategory } from '../models/product.model';

const WISHLIST_KEY = 'xeweul_wishlist';

const CATEGORY_MAP: Record<string, ProductCategory> = {
  beverages: 'beverages',
  shoes: 'shoes',
  footwear: 'shoes',
  equipment: 'equipment',
  apparel: 'apparel',
  clothing: 'apparel',
  accessories: 'accessories',
  other: 'accessories',
};

function mapApiProduct(a: any): Product {
  const lowerName = (a.name || '').toLowerCase();
  let cat: ProductCategory = CATEGORY_MAP[a.category] ?? 'equipment';
  if (lowerName.includes('eau') || lowerName.includes('bouteille') || lowerName.includes('boisson')) {
    cat = 'beverages';
  }
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    category: cat,
    price: Number(a.price ?? 0),
    currency: 'FCFA',
    rating: 0,
    reviewCount: 0,
    images: a.image_url ? [{ url: a.image_url, alt: a.name }] : [],
    imageUrl: a.image_url ?? '',
    vendor: {
      id: a.vendor_id ?? '',
      name: a.vendor?.user
        ? `${a.vendor.user.first_name ?? ''} ${a.vendor.user.last_name ?? ''}`.trim()
        : (a.vendor?.shop_name ?? 'Boutique'),
      description: '',
      isVerified: true,
      rating: 0,
      totalProducts: 0,
      location: a.vendor?.location ?? '',
      phone: a.vendor?.contact_phone ?? '',
    },
    brand: a.brand ?? '',
    tags: [],
    isAvailable: (a.stock_quantity ?? 0) > 0,
    isFeatured: false,
    stock: a.stock_quantity ?? 0,
    sport: a.sport_type ?? '',
  };
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private api = inject(ApiService);

  readonly products = signal<Product[]>([]);
  readonly wishlist = signal<string[]>(this.loadWishlist());
  readonly loading = signal(false);

  private getCurrentUserId(): string | null {
    try {
      const stored = localStorage.getItem('xeweul_user');
      if (stored) {
        const u = JSON.parse(stored);
        return u.id || null;
      }
    } catch {}
    return null;
  }

  loadWishlist(): string[] {
    const userId = this.getCurrentUserId();
    if (!userId) return [];
    try {
      const stored = localStorage.getItem(`${WISHLIST_KEY}_${userId}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  reloadWishlist(): void {
    this.wishlist.set(this.loadWishlist());
  }

  clearWishlist(): void {
    this.wishlist.set([]);
  }

  getProducts(category?: ProductCategory): Observable<Product[]> {
    return this.api.get<any>(`/products`).pipe(
      map(res => {
        let prods = (Array.isArray(res) ? res : (res.data ?? [])).map(mapApiProduct);
        if (category && category !== 'all') {
          prods = prods.filter((p: Product) => p.category === category);
        }
        return prods;
      })
    );
  }

  getFeaturedProducts(): Observable<Product[]> {
    return this.api.get<any>('/products').pipe(
      map(res => (Array.isArray(res) ? res : (res.data ?? [])).slice(0, 6).map(mapApiProduct))
    );
  }

  getProductById(id: string): Observable<Product | undefined> {
    return this.api.get<any>(`/products/${id}`).pipe(
      map(a => a ? mapApiProduct(a.data || a) : undefined)
    );
  }

  searchProducts(query: string): Observable<Product[]> {
    return this.api.get<any>('/products').pipe(
      map(res => {
        const lower = query.toLowerCase();
        return (res.data ?? res)
          .map(mapApiProduct)
          .filter((p: Product) => p.name.toLowerCase().includes(lower));
      })
    );
  }

  toggleWishlist(productId: string): void {
    const userId = this.getCurrentUserId();
    if (!userId) return;

    this.wishlist.update(list => {
      const next = list.includes(productId)
        ? list.filter(id => id !== productId)
        : [...list, productId];
      localStorage.setItem(`${WISHLIST_KEY}_${userId}`, JSON.stringify(next));
      return next;
    });
  }

  isWishlisted(productId: string): boolean {
    return this.wishlist().includes(productId);
  }
}
