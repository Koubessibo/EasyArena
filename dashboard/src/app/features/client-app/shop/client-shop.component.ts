import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { Product } from '../../vendor/products/vendor-products.component';

export interface CartItem {
  product: Product;
  quantity: number;
}

@Component({
  selector: 'app-client-shop',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-shop.component.html',
  styleUrls: ['./client-shop.component.scss']
})
export class ClientShopComponent implements OnInit {
  private api = inject(ApiService);

  products = signal<Product[]>([]);
  cart = signal<CartItem[]>([]);
  isLoading = signal(true);
  isCheckingOut = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  cartTotal = computed(() => {
    return this.cart().reduce((total, item) => total + (item.product.price * item.quantity), 0);
  });

  cartItemCount = computed(() => {
    return this.cart().reduce((count, item) => count + item.quantity, 0);
  });

  ngOnInit(): void {
    this.fetchProducts();
  }

  fetchProducts(): void {
    this.isLoading.set(true);
    this.api.get<any>('/products').subscribe({
      next: (res) => {
        // Ne garder que les produits en stock
        const inStock = (res.data || []).filter((p: Product) => p.stock_quantity > 0);
        this.products.set(inStock);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Impossible de charger les produits.');
        this.isLoading.set(false);
      }
    });
  }

  addToCart(product: Product): void {
    this.cart.update(items => {
      const existing = items.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) return items; // Impossible d'ajouter plus que le stock
        return items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...items, { product, quantity: 1 }];
    });
  }

  removeFromCart(productId: string): void {
    this.cart.update(items => items.filter(i => i.product.id !== productId));
  }

  checkout(): void {
    if (this.cart().length === 0) return;

    this.isCheckingOut.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const payload = {
      cartItems: this.cart().map(item => ({
        productId: item.product.id,
        quantity: item.quantity
      }))
    };

    this.api.post<any>('/orders/checkout', payload).subscribe({
      next: () => {
        this.isCheckingOut.set(false);
        this.successMessage.set('Commande validée et payée avec succès !');
        this.cart.set([]); // Vider le panier
        this.fetchProducts(); // Rafraîchir les stocks
        
        setTimeout(() => this.successMessage.set(null), 5000);
      },
      error: (err) => {
        this.isCheckingOut.set(false);
        this.errorMessage.set(err.message || 'Erreur lors du paiement.');
      }
    });
  }
}
