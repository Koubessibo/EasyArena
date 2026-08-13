import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent {
  public cartService = inject(CartService);
  private router = inject(Router);

  proceedToPayment(): void {
    if (this.cartService.count() === 0) return;
    this.router.navigate(['/shop/payment']);
  }
}
