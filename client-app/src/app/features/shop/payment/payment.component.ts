import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../core/services/cart.service';
import { ApiService } from '../../../core/services/api.service';
import { WebSocketService } from '../../../core/services/websocket.service';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './payment.component.html',
  styleUrls: ['./payment.component.scss']
})
export class ShopPaymentComponent {
  private cartService = inject(CartService);
  private api = inject(ApiService);
  private router = inject(Router);

  private wsService = inject(WebSocketService);

  public cart = this.cartService;

  phone = signal('');
  operator = signal<'WAVE' | 'OM'>('WAVE');
  isProcessing = signal(false);
  errorMessage = signal<string | null>(null);

  // Step: 'form' | 'processing' | 'gateway' | 'success'
  step = signal<'form' | 'processing' | 'gateway' | 'success'>('form');
  orderReference = signal('');
  orderTotal = signal(0);
  paymentGatewayUrls = signal<any>(null);

  confirmPayment(): void {
    const phoneVal = this.phone().trim();
    if (!phoneVal || phoneVal.length < 9) {
      this.errorMessage.set('Veuillez saisir un numéro de téléphone valide.');
      return;
    }
    if (this.cartService.count() === 0) {
      this.errorMessage.set('Votre panier est vide.');
      return;
    }

    this.errorMessage.set(null);
    this.step.set('processing');

    const payload = {
      cartItems: this.cartService.items().map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
      })),
      paymentPhone: phoneVal,
      operator: this.operator(),
    };

    this.api.post<any>('/orders/checkout', payload).subscribe({
      next: (res) => {
        const data = res.data;
        this.orderReference.set(data?.reference || 'N/A');
        this.orderTotal.set(this.cartService.total());
        
        if (data?.status === 'PENDING_PAYMENT') {
           this.paymentGatewayUrls.set({ redirect_url: data.redirect_url, urls: data.urls });
           this.step.set('gateway');

           this.wsService.connect();
           this.wsService.joinBooking(data.reference); // The reference is used as orderId!
           
           const wsSub = this.wsService.onPaymentConfirmed().subscribe(() => {
              this.wsService.disconnect();
              wsSub.unsubscribe();
              this.cartService.clearCart();
              this.step.set('success');
           });

           const wsFail = this.wsService.onPaymentFailed().subscribe(() => {
              this.wsService.disconnect();
              wsFail.unsubscribe();
              this.step.set('form');
              this.errorMessage.set('Le paiement a été refusé ou a échoué.');
           });

           if (data.redirect_url && !/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
              window.open(data.redirect_url, '_blank');
           } else if (data.redirect_url) {
              window.location.href = data.redirect_url;
           }
        } else {
           // Gratuit / Déjà payé
           this.cartService.clearCart();
           this.step.set('success');
        }
      },
      error: (err) => {
        this.step.set('form');
        this.errorMessage.set(err.error?.message || err.message || 'Erreur lors du paiement.');
      }
    });
  }

  goToOrders(): void {
    this.router.navigate(['/orders']);
  }
}
