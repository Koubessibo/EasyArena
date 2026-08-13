import { Injectable, signal, computed, inject } from '@angular/core';
import { Product } from '../models/product.model';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface AddedToastData {
  name: string;
  imageUrl?: string;
  price: number;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(ApiService);

  readonly items = signal<CartItem[]>(this.loadCart());
  readonly addedToast = signal<AddedToastData | null>(null);
  private toastTimer: any = null;

  readonly total = computed(() => {
    return this.items().reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  });

  readonly count = computed(() => {
    return this.items().reduce((sum, item) => sum + item.quantity, 0);
  });

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

  loadCart(): CartItem[] {
    const userId = this.getCurrentUserId();
    if (!userId) return [];
    try {
      const stored = localStorage.getItem(`xeweul_cart_${userId}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  reloadCart(): void {
    this.items.set(this.loadCart());
  }

  private saveCart(items: CartItem[]): void {
    const userId = this.getCurrentUserId();
    if (userId) {
      localStorage.setItem(`xeweul_cart_${userId}`, JSON.stringify(items));
    }
  }

  addToCart(product: Product): void {
    this.items.update(items => {
      const existing = items.find(i => i.product.id === product.id);
      let newItems;
      if (existing) {
        if (existing.quantity >= product.stock) return items; // limit to stock
        newItems = items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      } else {
        newItems = [...items, { product, quantity: 1 }];
      }
      this.saveCart(newItems);
      return newItems;
    });

    // Trigger Toast Notification
    this.showToast({
      name: product.name,
      imageUrl: product.imageUrl,
      price: product.price
    });
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeFromCart(productId);
      return;
    }

    this.items.update(items => {
      const newItems = items.map(item => {
        if (item.product.id === productId) {
          const validQty = Math.min(quantity, item.product.stock || 99);
          return { ...item, quantity: validQty };
        }
        return item;
      });
      this.saveCart(newItems);
      return newItems;
    });
  }

  removeFromCart(productId: string): void {
    this.items.update(items => {
      const newItems = items.filter(i => i.product.id !== productId);
      this.saveCart(newItems);
      return newItems;
    });
  }

  clearCart(): void {
    this.items.set([]);
    this.saveCart([]);
  }

  checkout(): Observable<any> {
    const payload = {
      cartItems: this.items().map(item => ({
        productId: item.product.id,
        quantity: item.quantity
      }))
    };
    return this.api.post<any>('/orders/checkout', payload);
  }

  private showToast(data: AddedToastData): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.addedToast.set(data);
    this.toastTimer = setTimeout(() => {
      this.addedToast.set(null);
    }, 3500);
  }

  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.addedToast.set(null);
  }
}
