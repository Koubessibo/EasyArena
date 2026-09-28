import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from './entities/payment.entity';
import { Owner } from '../users/entities/owner.entity';
import { BookingStatus, NotificationPriority, NotificationType, PaymentStatus, TransactionDirection, TransactionSourceType, TransactionType } from '../../common/enums';
import { IPaymentProvider, PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { IotService } from '../iot/iot.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PaymentGateway } from './payment.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { RecipientsResolver } from '../notifications/recipients.resolver';
import { SponsorshipService } from '../sponsorship/sponsorship.service';

const SERVICE_FEE_PERCENT = 0.05;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Owner) private readonly ownerRepo: Repository<Owner>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
    private readonly iotService: IotService,
    private readonly transactionsService: TransactionsService,
    private readonly paymentGateway: PaymentGateway,
    private readonly notificationsService: NotificationsService,
    private readonly recipientsResolver: RecipientsResolver,
    private readonly sponsorshipService: SponsorshipService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingPayments() {
    this.logger.log('[Reconciliation] Démarrage du Cron Job de réconciliation des paiements Mobile Money...');
    
    // Threshold: 15 minutes ago
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const orphanBookings = await this.bookingRepo.find({
      where: {
        status: BookingStatus.PENDING_PAYMENT,
        created_at: LessThanOrEqual(fifteenMinutesAgo),
      },
      relations: ['field', 'client', 'client.user', 'payment'],
    });

    if (orphanBookings.length === 0) {
      this.logger.log('[Reconciliation] Aucune réservation orpheline en attente depuis > 15 minutes.');
      return { processed: 0, confirmed: 0, cancelled: 0 };
    }

    this.logger.log(`[Reconciliation] ${orphanBookings.length} réservation(s) orpheline(s) à vérifier.`);

    let confirmedCount = 0;
    let cancelledCount = 0;

    for (const booking of orphanBookings) {
      try {
        const ref = booking.payment?.id || booking.payment?.external_ref || booking.id;
        let verifyResult = await this.paymentProvider.verifyTransaction(ref);
        this.logger.log(`[Reconciliation] Réservation ${booking.id} (ref=${ref}) → Statut API SamirPay : ${verifyResult.status}`);

        // If not successful and we also have external_ref different from ref, try external_ref too
        if (verifyResult.status !== 'SUCCESS' && booking.payment?.external_ref && booking.payment.external_ref !== ref) {
          const retryResult = await this.paymentProvider.verifyTransaction(booking.payment.external_ref);
          this.logger.log(`[Reconciliation] Réservation ${booking.id} (external_ref=${booking.payment.external_ref}) → Statut API SamirPay : ${retryResult.status}`);
          if (retryResult.status === 'SUCCESS') {
            verifyResult = retryResult;
          }
        }

        if (verifyResult.status === 'SUCCESS') {
          await this.confirmOrphanBooking(booking);
          confirmedCount++;
        } else if (verifyResult.status === 'FAILED' || verifyResult.status === 'EXPIRED') {
          await this.cancelOrphanBooking(booking, verifyResult.status);
          cancelledCount++;
        }
      } catch (err: any) {
        this.logger.error(`[Reconciliation] Erreur lors de la vérification de la réservation ${booking.id}: ${err.message}`);
      }
    }

    this.logger.log(`[Reconciliation] Bilan : ${orphanBookings.length} traitées, ${confirmedCount} repêchées/confirmées, ${cancelledCount} annulées.`);
    return { processed: orphanBookings.length, confirmed: confirmedCount, cancelled: cancelledCount };
  }

  async confirmOrphanBooking(booking: Booking) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (booking.payment) {
        await qr.manager.update(Payment, booking.payment.id, {
          status: PaymentStatus.SUCCESS,
          paid_at: new Date(),
        });
      }

      await qr.manager.update(Booking, booking.id, { status: BookingStatus.CONFIRMED });

      // Trigger IoT queue
      try {
        await this.iotService.scheduleFieldLights(
          booking.id,
          booking.field_id,
          booking.slot_start,
          booking.slot_end,
          booking.booking_date.toString(),
        );
      } catch (iotErr) {
        this.logger.error(`[Reconciliation IoT] Échec de la planification des projecteurs pour ${booking.id}`, iotErr);
      }

      // Credit Owner
      const owner = await qr.manager.findOne(Owner, {
        where: { fields: { id: booking.field_id } },
        relations: ['user'],
      });

      if (owner) {
        const rawAmount = Number(booking.payment?.amount || (Number(booking.total_amount) + Number(booking.service_fee)));
        const ownerCredit = Number(booking.total_amount);
        const balanceBefore = await this.transactionsService.computeOwnerBalance(owner.id, qr.manager);

        await this.transactionsService.createTransaction(
          {
            owner_id: owner.id,
            type: TransactionType.BOOKING_CREDIT,
            direction: TransactionDirection.CREDIT,
            amount: ownerCredit,
            balance_before: balanceBefore,
            source_id: booking.payment?.id || booking.id,
            source_type: TransactionSourceType.PAYMENT,
            description: `Réservation ${booking.id} repêchée et confirmée via Réconciliation Cron`,
          },
          qr.manager,
        );

        if (owner.user) {
          const ownerMsg = `Nouvelle réservation confirmée via réconciliation.\nTerrain : ${booking.field?.name ?? ''}\nDate : ${booking.booking_date} | ${booking.slot_start} - ${booking.slot_end}\nMontant : ${ownerCredit} FCFA`;
          await this.notificationsService.sendRawSms(owner.user.phone, ownerMsg).catch(() => {});
          await this.notificationsService.sendSms(owner.user.id, owner.user.phone, ownerMsg).catch(() => {});
        }
      }

      // Sponsorship commission distribution (N1/N2)
      if (booking.client?.user) {
        const principalAmount = Number(booking.total_amount);
        try {
          await this.sponsorshipService.distributeCommissions(
            booking.client.user.id, principalAmount, booking.payment?.id || booking.id, qr.manager,
          );
        } catch (e: any) {
          this.logger.warn(`[Sponsorship] Distribution failed in reconciliation: ${e.message}`);
        }
      }

      // Client SMS
      if (booking.client?.user) {
        const u = booking.client.user;
        const clientMsg = `Bonjour ${u.first_name}, votre réservation pour le terrain ${booking.field?.name ?? ''} le ${booking.booking_date} de ${booking.slot_start} à ${booking.slot_end} est validée avec succès.`;
        await this.notificationsService.sendRawSms(u.phone, clientMsg).catch(() => {});
        await this.notificationsService.sendSms(u.id, u.phone, clientMsg).catch(() => {});
      }

      await qr.commitTransaction();

      // In-app : mêmes dedupe_key que le webhook. Si les deux s'exécutent
      // (course webhook/cron), l'index unique n'en laisse passer qu'une seule.
      await this.notifyReconciledBookingConfirmed(booking, owner ?? null);

      this.paymentGateway.notifyPaymentConfirmed(booking.id);
      this.logger.log(`🎉 [Reconciliation] SUCCESS : La réservation orpheline ${booking.id} a été validée, payée et transmise à l'IoT !`);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async cancelOrphanBooking(booking: Booking, apiStatus: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (booking.payment) {
        await qr.manager.update(Payment, booking.payment.id, { status: PaymentStatus.FAILED });
      }

      const newStatus = apiStatus === 'EXPIRED' ? BookingStatus.EXPIRED : BookingStatus.CANCELLED;
      await qr.manager.update(Booking, booking.id, { status: newStatus });

      await qr.commitTransaction();

      // Même dedupe_key que le webhook d'échec : pas de doublon si les deux
      // voies confirment la même réservation échouée.
      await this.notifyReconciledBookingFailed(booking);

      this.paymentGateway.notifyPaymentFailed(booking.id);
      this.logger.log(`🧹 [Reconciliation] FREED : La réservation orpheline ${booking.id} a été libérée (${newStatus}). Créneau à nouveau disponible.`);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  IN-app (Phase 3) — identiques aux clés du webhook
  // ══════════════════════════════════════════════════════════════════

  /**
   * Repêchage réussi : le client et l'équipe terrain doivent voir la même
   * confirmation que s'il y avait eu webhook. Appelé après commit.
   */
  private async notifyReconciledBookingConfirmed(
    booking: Booking,
    owner: Owner | null,
  ): Promise<void> {
    if (booking.client?.user) {
      await this.notificationsService.notify({
        userId: booking.client.user.id,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Réservation confirmée',
        message:
          `Votre réservation du ${booking.booking_date.split('-').reverse().join('/')} ` +
          `à ${booking.slot_start} sur ${booking.field?.name ?? 'votre terrain'} est confirmée.`,
        link: `/booking/${booking.id}`,
        metadata: {
          bookingId: booking.id,
          paymentId: booking.payment?.id,
          fieldId: booking.field_id,
        },
        priority: NotificationPriority.ACTION,
        dedupeKey: `booking:${booking.id}:confirmed`,
      });
    }

    if (!owner?.user) return;

    const recipients = await this.recipientsResolver.ownerTeamOf(
      owner.id,
      owner.user.id,
    );
    await this.notificationsService.notifyMany(recipients, {
      type: NotificationType.BOOKING_NEW,
      title: 'Nouvelle réservation',
      message:
        `${booking.field?.name ?? 'Terrain'} — ${booking.booking_date} ` +
        `à ${booking.slot_start}. Réservation repêchée par la réconciliation.`,
      link: '/owner/overview',
      metadata: {
        bookingId: booking.id,
        fieldId: booking.field_id,
      },
      priority: NotificationPriority.ACTION,
      dedupeKey: `booking:${booking.id}:new`,
    });
  }

  /** Paiement définitivement perdu : le client doit pouvoir réessayer. */
  private async notifyReconciledBookingFailed(booking: Booking): Promise<void> {
    if (!booking.client?.user) return;

    await this.notificationsService.notify({
      userId: booking.client.user.id,
      type: NotificationType.PAYMENT_FAILED,
      title: 'Paiement échoué',
      message:
        `Le paiement de votre réservation du ${booking.booking_date} ` +
        `a expiré ou échoué. Vous pouvez réessayer depuis votre historique.`,
      link: `/booking/${booking.id}`,
      metadata: {
        bookingId: booking.id,
        paymentId: booking.payment?.id,
      },
      priority: NotificationPriority.ACTION,
      dedupeKey: `payment:${booking.payment?.id ?? booking.id}:failed`,
    });
  }
}
