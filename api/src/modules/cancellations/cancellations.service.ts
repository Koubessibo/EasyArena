import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus, TransactionType, TransactionDirection, TransactionSourceType } from '../../common/enums';
import { Transaction } from '../transactions/entities/transaction.entity';

import { SponsorshipService } from '../sponsorship/sponsorship.service';

@Injectable()
export class CancellationsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly dataSource: DataSource,
    private readonly sponsorshipService: SponsorshipService,
  ) {}

  /**
   * Le Client demande l'annulation de sa réservation
   */
  async requestCancellation(reservationId: string, clientId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: reservationId, client_id: clientId },
      relations: ['field', 'field.owner'], // Nécessaire pour simuler l'envoi de notif au proprio
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable ou non autorisée');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Seule une réservation confirmée peut être annulée');
    }

    const matchDate = new Date(booking.booking_date);
    const now = new Date();
    // On met à minuit pour comparer les jours (selon les règles de gestion exactes)
    matchDate.setHours(0, 0, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (matchDate < today) {
      throw new BadRequestException('La date du match est déjà passée. Annulation impossible.');
    }

    booking.status = BookingStatus.CANCELLATION_PENDING;
    const savedBooking = await this.bookingRepo.save(booking);

    // TODO: Envoi réel via un module Notifications
    this.simulateNotification(booking.field.owner_id, booking.id);

    return savedBooking;
  }

  /**
   * Le Propriétaire récupère ses demandes d'annulation en attente
   */
  async getPendingRequests(ownerId: string): Promise<Booking[]> {
    return this.bookingRepo.find({
      where: {
        field: { owner_id: ownerId },
        status: BookingStatus.CANCELLATION_PENDING,
      },
      relations: ['client', 'field'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Le Propriétaire traite (accepte/refuse) la demande d'annulation
   */
  async processCancellation(reservationId: string, ownerId: string, isAccepted: boolean): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: reservationId },
        relations: ['field'], // Pour s'assurer du proprio
      });

      if (!booking) {
        throw new NotFoundException('Réservation introuvable');
      }

      if (booking.field.owner_id !== ownerId) {
        throw new BadRequestException('Vous n\'êtes pas le propriétaire de ce terrain');
      }

      if (booking.status !== BookingStatus.CANCELLATION_PENDING) {
        throw new BadRequestException('Cette réservation n\'est pas en attente d\'annulation');
      }

      if (!isAccepted) {
        // Refus : on remet à CONFIRMED
        booking.status = BookingStatus.CONFIRMED;
        await manager.save(booking);
        return { message: 'Annulation refusée, réservation rétablie', booking };
      }

      // ── ACCEPTATION ET CALCULS FINANCIERS ──
      const initialAmount = Number(booking.total_amount);
      
      // Frais de service plateforme = 5%
      const platformFee = initialAmount * 0.05;
      
      // Reste pour le client
      const remainingAmount = initialAmount - platformFee;
      
      // Frais de reversement (ex: opérateur mobile) = 1% du reste
      const withdrawalFee = remainingAmount * 0.01;
      
      // Montant final remboursé au client
      const finalRefund = remainingAmount - withdrawalFee;

      // Logique transactionnelle (Optionnelle si on n'a pas de table Refund, mais tracée ici)
      const refundRecord = manager.create(Transaction, {
        owner_id: ownerId, // Le propriétaire est amputé de ce montant ou on trace pour le système
        type: TransactionType.REFUND_DEBIT,
        direction: TransactionDirection.DEBIT,
        amount: finalRefund,
        balance_before: 0, // Fallback (géré dans le vrai système de wallet)
        balance_after: 0,
        reference: `REFUND-${booking.id.substring(0,8).toUpperCase()}`,
        source_id: booking.id,
        source_type: TransactionSourceType.REFUND,
        description: `Remboursement suite à annulation. Brut: ${initialAmount}, Frais service: ${platformFee}, Frais retrait: ${withdrawalFee}, Net remboursé: ${finalRefund}`,
      });
      await manager.save(refundRecord);

      // Mise à jour de la réservation
      booking.status = BookingStatus.CANCELLED;
      const savedBooking = await manager.save(booking);

      // Annulation des commissions en attente (Escrow)
      try {
        await this.sponsorshipService.cancelCommissions(booking.id, manager);
      } catch (e) {
        console.warn(`[Cancellations] Failed to cancel commissions for booking ${booking.id}: ${e.message}`);
      }


      return {
        message: 'Annulation acceptée et remboursement traité',
        financial_details: {
          initial_amount: initialAmount,
          platform_fee_5_percent: platformFee,
          withdrawal_fee_1_percent: withdrawalFee,
          refunded_amount: finalRefund,
        },
        booking: savedBooking,
      };
    });
  }

  private simulateNotification(ownerId: string, bookingId: string) {
    console.log(`[NOTIF-SIMULATOR] -> SMS et Notification Interne envoyés au Propriétaire [${ownerId}]`);
    console.log(`[NOTIF-SIMULATOR] -> Message : "Le client a demandé l'annulation de la réservation ${bookingId}".`);
  }
}
