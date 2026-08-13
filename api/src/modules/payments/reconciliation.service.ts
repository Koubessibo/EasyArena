import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from './entities/payment.entity';
import { Owner } from '../users/entities/owner.entity';
import { BookingStatus, PaymentStatus, TransactionDirection, TransactionSourceType, TransactionType } from '../../common/enums';
import { IPaymentProvider, PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { IotService } from '../iot/iot.service';
import { TransactionsService } from '../transactions/transactions.service';

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
      relations: ['field', 'client', 'payment'],
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
        const verifyResult = await this.paymentProvider.verifyTransaction(booking.id);
        this.logger.log(`[Reconciliation] Réservation ${booking.id} → Statut API SamirPay : ${verifyResult.status}`);

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
      }

      await qr.commitTransaction();
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
      this.logger.log(`🧹 [Reconciliation] FREED : La réservation orpheline ${booking.id} a été libérée (${newStatus}). Créneau à nouveau disponible.`);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
