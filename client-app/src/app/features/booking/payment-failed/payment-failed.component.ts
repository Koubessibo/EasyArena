import { Component, signal, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-payment-failed',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './payment-failed.component.html',
  styleUrl: './payment-failed.component.scss',
})
export class PaymentFailedComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  errorCode = signal('');
  errorMessage = signal('');

  readonly errorMessages: Record<string, string> = {
    insufficient_funds: 'Solde insuffisant sur votre compte.',
    network_error: 'Erreur réseau. Vérifiez votre connexion et réessayez.',
    invalid_number: 'Le numéro de téléphone saisi est invalide.',
    timeout: 'La transaction a expiré. Veuillez réessayer.',
    declined: 'Transaction refusée par votre opérateur.',
    default: 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
  };

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code') || 'default';
    this.errorCode.set(code);
    this.errorMessage.set(this.errorMessages[code] || this.errorMessages['default']);
  }

  retry(): void {
    this.router.navigate(['/booking/payment']);
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }
}
