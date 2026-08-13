import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { Product } from '../../../core/models/product.model';
import { FcfaPipe } from '../../pipes/fcfa.pipe';
import { ProductService } from '../../../core/services/product.service';
import { CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, NgIf, FcfaPipe],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;

  private productService = inject(ProductService);
  private cartService = inject(CartService);

  get isWishlisted(): boolean {
    return this.productService.isWishlisted(this.product.id);
  }

  toggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.productService.toggleWishlist(this.product.id);
  }

  addToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cartService.addToCart(this.product);
  }

  get discountPercent(): number | null {
    if (!this.product.originalPrice) return null;
    return Math.round(((this.product.originalPrice - this.product.price) / this.product.originalPrice) * 100);
  }
}
