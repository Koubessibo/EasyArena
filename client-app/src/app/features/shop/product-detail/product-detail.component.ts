import { Component, signal, inject, OnInit, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor, DecimalPipe } from '@angular/common';
import { ProductService } from '../../../core/services/product.service';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';
import { Product } from '../../../core/models/product.model';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { AuthPromptComponent } from '../../../shared/components/auth-prompt/auth-prompt.component';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, DecimalPipe, FcfaPipe, AuthPromptComponent],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
})
export class ProductDetailComponent implements OnInit {
  @Input() id!: string;

  private productService = inject(ProductService);
  private authService = inject(AuthService);
  private cartService = inject(CartService);

  showAuthPrompt = signal(false);
  product = signal<Product | undefined>(undefined);
  loading = signal(true);
  activeImageIndex = signal(0);

  get isWishlisted(): boolean {
    const p = this.product();
    return p ? this.productService.isWishlisted(p.id) : false;
  }

  ngOnInit(): void {
    this.productService.getProductById(this.id).subscribe(p => {
      this.product.set(p);
      this.loading.set(false);
    });
  }

  toggleWishlist(): void {
    const p = this.product();
    if (!p) return;
    this.productService.toggleWishlist(p.id);
  }

  selectImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  addToCart(): void {
    const p = this.product();
    if (!p) return;
    this.cartService.addToCart(p);
  }

  get discountPercent(): number | null {
    const p = this.product();
    if (!p?.originalPrice) return null;
    return Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
  }
}
