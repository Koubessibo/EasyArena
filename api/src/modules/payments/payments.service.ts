import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../users/entities/client.entity';
import { Owner } from '../users/entities/owner.entity';
import { Payment } from './entities/payment.entity';
import { EventTicket } from '../tickets/entities/event-ticket.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IotService } from '../iot/iot.service';
import { IPaymentProvider, PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { PaymentGateway } from './payment.gateway';
import {
  BookingStatus,
  PaymentStatus,
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
  SubscriptionStatus,
  InstallmentStatus,
} from '../../common/enums';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { PaymentInstallment } from '../subscriptions/entities/payment-installment.entity';
import { UserSubscription } from '../subscriptions/entities/user-subscription.entity';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { User } from '../users/entities/user.entity';

const SERVICE_FEE_PERCENT = 0.05;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Owner) private readonly ownerRepo: Repository<Owner>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
    private readonly paymentGateway: PaymentGateway,
    private readonly iotService: IotService,
  ) {}

  async initiatePayment(user: User, bookingId: string, dto: InitiatePaymentDto) {
    const client = await this.clientRepo.findOne({ where: { user: { id: user.id } } });
    if (!client) throw new NotFoundException('Client not found');

    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId, client_id: client.id },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Booking is not awaiting payment');
    }
    if (new Date() > booking.expires_at) {
      await this.bookingRepo.update(booking.id, { status: BookingStatus.EXPIRED });
      throw new BadRequestException('Booking has expired');
    }

    const fullAmount = Number(booking.total_amount) + Number(booking.service_fee);

    if (dto.paid_amount !== undefined) {
      if (booking.min_deposit_amount != null && dto.paid_amount < Number(booking.min_deposit_amount)) {
        throw new BadRequestException(
          `Le montant minimum requis est de ${booking.min_deposit_amount} FCFA`,
        );
      }
      if (dto.paid_amount > Number(booking.total_amount)) {
        throw new BadRequestException('Le montant ne peut pas dépasser le total');
      }
    }

    const paymentAmount = dto.paid_amount !== undefined
      ? dto.paid_amount + Math.round(dto.paid_amount * SERVICE_FEE_PERCENT)
      : fullAmount;

    const allSlotStarts = this.getSlotStarts(booking);

    // Verify no slot in the range is already confirmed by a concurrent booking
    const confirmedConflict = await this.bookingRepo.findOne({
      where: {
        field_id: booking.field_id,
        booking_date: booking.booking_date,
        slot_start: In(allSlotStarts),
        status: BookingStatus.CONFIRMED,
      },
    });
    if (confirmedConflict) {
      await this.bookingRepo.update(booking.id, { status: BookingStatus.CANCELLED });
      throw new ConflictException('Slot already confirmed by another booking');
    }

    // Check for existing pending payment — re-call provider to get fresh URLs/QR
    const existingPayment = await this.paymentRepo.findOne({ where: { booking_id: bookingId } });
    if (existingPayment?.status === PaymentStatus.PENDING) {
      let result;
      try {
        result = await this.paymentProvider.initiatePayment({
          amount: paymentAmount,
          operator: dto.operator,
          reference: existingPayment.id,
          phone: dto.phone,
        });
      } catch (err) {
        await this.bookingRepo.update(booking.id, { status: BookingStatus.EXPIRED });
        await this.paymentRepo.delete(existingPayment.id);
        throw err;
      }
      await this.paymentRepo.update(existingPayment.id, {
        external_ref: result.external_ref,
        operator: dto.operator ?? existingPayment.operator,
        phone_number: dto.phone ?? existingPayment.phone_number,
      });
      return {
        payment_id: existingPayment.id,
        external_ref: result.external_ref,
        redirect_url: result.redirect_url,
        urls: result.urls,
        qr_code: result.qr_code,
      };
    }

    // Create payment record FIRST so we can use payment.id as Samirpay orderId
    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        booking_id: bookingId,
        method: dto.method,
        amount: paymentAmount,
        status: PaymentStatus.PENDING,
        operator: dto.operator ?? undefined,
        phone_number: dto.phone ?? undefined,
      }),
    );

    let result;
    try {
      result = await this.paymentProvider.initiatePayment({
        amount: paymentAmount,
        operator: dto.operator,
        reference: payment.id,
        phone: dto.phone,
      });
    } catch (err) {
      await this.bookingRepo.update(booking.id, { status: BookingStatus.EXPIRED });
      await this.paymentRepo.delete(payment.id);
      throw err;
    }

    await this.paymentRepo.update(payment.id, { external_ref: result.external_ref });

    const response = {
      payment_id: payment.id,
      external_ref: result.external_ref,
      redirect_url: result.redirect_url,
      urls: result.urls,
      qr_code: result.qr_code,
    };

    // Auto-confirm only when using the mock provider (no real payment flow)
    if (process.env.PAYMENT_PROVIDER_NAME !== 'samirpay') {
      setImmediate(() => this._devAutoConfirm(payment.id, booking.id));
    }

    return response;
  }

  private async _devAutoConfirm(paymentId: string, bookingId: string): Promise<void> {
    try {
      const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
      if (!payment || payment.status !== PaymentStatus.PENDING) return;

      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await qr.manager.update(Payment, payment.id, { status: PaymentStatus.SUCCESS, paid_at: new Date() });

        const booking = await qr.manager.findOne(Booking, {
          where: { id: payment.booking_id },
          relations: ['field', 'client', 'client.user'],
        });
        if (!booking) { await qr.rollbackTransaction(); return; }

        await qr.manager.update(Booking, booking.id, { status: BookingStatus.CONFIRMED });
        
        // IoT Scheduling
        try {
          await this.iotService.scheduleFieldLights(booking.id, booking.field_id, booking.slot_start, booking.slot_end, booking.booking_date.toString());
        } catch (e) {
          this.logger.error('Failed to schedule IoT lights', e);
        }

        const owner = await qr.manager.findOne(Owner, {
          where: { fields: { id: booking.field_id } },
          relations: ['user'],
        });
        if (owner) {
          const balanceBefore = await this.transactionsService.computeOwnerBalance(owner.id, qr.manager);
          await this.transactionsService.createTransaction(
            {
              owner_id: owner.id,
              type: TransactionType.BOOKING_CREDIT,
              direction: TransactionDirection.CREDIT,
              amount: Number(payment.amount) - Math.round(Number(payment.amount) * SERVICE_FEE_PERCENT / (1 + SERVICE_FEE_PERCENT)),
              balance_before: balanceBefore,
              source_id: payment.id,
              source_type: TransactionSourceType.PAYMENT,
              description: `Booking ${booking.id} confirmed (dev auto)`,
            },
            qr.manager,
          );
        }
        await qr.commitTransaction();
        this.logger.debug(`[DEV] Auto-confirmed booking ${booking.id}`);
        if (owner?.user) {
          await this.notificationsService.sendSms(
            owner.user.id,
            owner.user.phone,
            this.buildOwnerSms(booking, payment),
          );
        }
        this.paymentGateway.notifyPaymentConfirmed(bookingId);
      } catch (err) {
        await qr.rollbackTransaction();
        this.logger.warn(`[DEV] Auto-confirm failed: ${err}`);
      } finally {
        await qr.release();
      }
    } catch (err) {
      this.logger.warn(`[DEV] Auto-confirm outer error: ${err}`);
    }
  }

  async handleWebhook(rawBody: string, signature: string, payload: WebhookPayloadDto) {
    // ══════════════════════════════════════════════════════════════════
    // SECURITY GATE: HMAC Signature Verification
    // ══════════════════════════════════════════════════════════════════
    if (!this.paymentProvider.verifyWebhook(rawBody, signature)) {
      this.logger.error(`[Webhook] REJECTED — invalid HMAC signature for order_id=${payload.order_id}`);
      throw new ForbiddenException('Invalid webhook signature');
    }
    this.logger.log(`[Webhook] Signature verified for order_id=${payload.order_id}`);

    // --- HANDLING STORE ORDERS ---
    if (payload.order_id && payload.order_id.startsWith('EA-')) {
       const orders = await this.dataSource.manager.find(Order, {
         where: { reference: payload.order_id }
       });
       if (!orders || orders.length === 0) {
          this.logger.warn(`Webhook: orders for reference ${payload.order_id} not found`);
          return { received: true };
       }
       // Integrity check: all orders must be in PENDING_PAYMENT
       const allPending = orders.every(o => o.status === OrderStatus.PENDING_PAYMENT);
       if (!allPending) {
          this.logger.warn(`[Webhook] Order ${payload.order_id} not in PENDING_PAYMENT — ignoring`);
          return { received: true, message: 'Already processed' };
       }
       if (payload.status === 'success') {
          for (const order of orders) {
             await this.dataSource.manager.update(Order, order.id, { status: OrderStatus.PAID });
          }
          this.paymentGateway.notifyPaymentConfirmed(payload.order_id);

          const phone = orders[0]?.payment_phone;
          if (phone) {
             const ref = payload.order_id;
             const msg = `Félicitations ! Votre paiement pour la commande EasyArena #${ref} a bien été reçu. Le vendeur prépare actuellement votre livraison.`;
             await this.notificationsService.sendRawSms(phone, msg);
          }
       } else {
          for (const order of orders) {
             await this.dataSource.manager.update(Order, order.id, { status: OrderStatus.CANCELLED });
             // Restore stock for each cancelled order's items
             const items = await this.dataSource.manager.find(OrderItem, { where: { order_id: order.id } });
             for (const item of items) {
               await this.dataSource.manager
                 .createQueryBuilder()
                 .update(Product)
                 .set({ stock_quantity: () => `stock_quantity + ${item.quantity}` })
                 .where('id = :id', { id: item.product_id })
                 .execute();
             }
          }
          this.paymentGateway.notifyPaymentFailed(payload.order_id);
          this.logger.log(`[Webhook] Orders ${payload.order_id} cancelled — stock restored`);
       }
       return { received: true };
    }

    // --- HANDLING SUBSCRIPTION INSTALLMENTS ---
    const installment = await this.dataSource.manager.findOne(PaymentInstallment, {
      where: { id: payload.order_id }
    });
    if (installment) {
       // Integrity check: installment must be PENDING
       if (installment.status !== InstallmentStatus.PENDING) {
          this.logger.warn(`[Webhook] Installment ${installment.id} not PENDING (${installment.status}) — ignoring`);
          return { received: true, message: 'Already processed' };
       }
       if (payload.status === 'success') {
          await this.dataSource.manager.update(PaymentInstallment, installment.id, { status: InstallmentStatus.PAID, paid_at: new Date() });

          // If first installment, activate subscription
          const subscription = await this.dataSource.manager.findOne(UserSubscription, { where: { id: installment.subscription_id } });
          if (subscription && subscription.status === SubscriptionStatus.PENDING) {
             await this.dataSource.manager.update(UserSubscription, subscription.id, { status: SubscriptionStatus.ACTIVE });
          }
          this.paymentGateway.notifyPaymentConfirmed(installment.id);
       } else {
          await this.dataSource.manager.update(PaymentInstallment, installment.id, { status: InstallmentStatus.FAILED });
          this.paymentGateway.notifyPaymentFailed(installment.id);
       }
       return { received: true };
    }

    // order_id = payment.id (used as orderId when calling Samirpay initPayment)
    const payment = await this.paymentRepo.findOne({
      where: { id: payload.order_id },
    });
    
    // --- HANDLING TICKETS PAYMENT WEBHOOK ---
    if (!payment) {
      const ticket = await this.dataSource.manager.findOne(EventTicket, {
        where: { id: payload.order_id },
        relations: ['client', 'client.user']
      });
      
      if (!ticket) {
        this.logger.warn(`Webhook: payment or ticket ${payload.order_id} not found`);
        return { received: true };
      }

      if (ticket.status !== 'PENDING_PAYMENT') {
        return { received: true, message: 'Ticket Already processed' };
      }

      if (payload.status === 'success') {
        await this.dataSource.manager.update(EventTicket, ticket.id, {
          status: 'VALID'
        });
        
        // Notify client via websocket that ticket is ready
        this.paymentGateway.notifyPaymentConfirmed(ticket.id);
        
        if (ticket.client?.user) {
          const u = ticket.client.user;
          const msg = `Félicitations ${u.first_name}, votre paiement a été validé ! Votre billet d'événement est maintenant disponible dans l'application EasyArena.`;
          await this.notificationsService.sendRawSms(u.phone, msg);
          await this.notificationsService.sendSms(u.id, u.phone, msg);
        }
      } else {
        await this.dataSource.manager.update(EventTicket, ticket.id, {
          status: 'FAILED'
        });
        this.paymentGateway.notifyPaymentFailed(ticket.id);
      }
      return { received: true };
    }
    // --- END TICKETS HANDLING ---

    if (payment.status !== PaymentStatus.PENDING) {
      return { received: true, message: 'Already processed' };
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (payload.status === 'success') {
        await qr.manager.update(Payment, payment.id, {
          status: PaymentStatus.SUCCESS,
          paid_at: new Date(),
          external_ref: payload.transaction_id,
        });

        const booking = await qr.manager.findOne(Booking, {
          where: { id: payment.booking_id },
          relations: ['field', 'client', 'client.user'],
        });
        if (!booking) throw new NotFoundException('Booking not found');

        const webhookSlotStarts = this.getSlotStarts(booking);
        const slotAlreadyConfirmed = await qr.manager.findOne(Booking, {
          where: {
            field_id: booking.field_id,
            booking_date: booking.booking_date,
            slot_start: In(webhookSlotStarts),
            status: BookingStatus.CONFIRMED,
          },
        });
        if (slotAlreadyConfirmed) {
          await qr.manager.update(Booking, booking.id, { status: BookingStatus.CANCELLED });
          await qr.manager.update(Payment, payment.id, { status: PaymentStatus.FAILED });
          await qr.commitTransaction();
          return { received: true };
        }

        await qr.manager.update(Booking, booking.id, { status: BookingStatus.CONFIRMED });

        // IoT Scheduling
        try {
          await this.iotService.scheduleFieldLights(booking.id, booking.field_id, booking.slot_start, booking.slot_end, booking.booking_date.toString());
        } catch (e) {
          this.logger.error('Failed to schedule IoT lights in webhook', e);
        }

        const owner = await qr.manager.findOne(Owner, {
          where: { fields: { id: booking.field_id } },
          relations: ['user'],
        });
        if (owner) {
          const balanceBefore = await this.transactionsService.computeOwnerBalance(owner.id, qr.manager);
          await this.transactionsService.createTransaction(
            {
              owner_id: owner.id,
              type: TransactionType.BOOKING_CREDIT,
              direction: TransactionDirection.CREDIT,
              amount: Number(payment.amount) - Math.round(Number(payment.amount) * SERVICE_FEE_PERCENT / (1 + SERVICE_FEE_PERCENT)),
              balance_before: balanceBefore,
              source_id: payment.id,
              source_type: TransactionSourceType.PAYMENT,
              description: `Booking ${booking.id} confirmed`,
            },
            qr.manager,
          );

          if (owner.user) {
            const ownerMsg = this.buildOwnerSms(booking, payment);
            await this.notificationsService.sendRawSms(owner.user.phone, ownerMsg);
            await this.notificationsService.sendSms(
              owner.user.id,
              owner.user.phone,
              ownerMsg,
            );
          }
        }

        if (booking.client?.user) {
          const u = booking.client.user;
          const fieldName = booking.field?.name ?? 'votre terrain';
          const rawPaid = Number(payment.amount);
          const totalWithFee = Number(booking.total_amount) + Number(booking.service_fee);
          const clientNet = rawPaid >= totalWithFee && totalWithFee > 0
            ? Number(booking.total_amount)
            : rawPaid - Math.round(rawPaid * SERVICE_FEE_PERCENT / (1 + SERVICE_FEE_PERCENT));
          const feePaid = rawPaid - clientNet;
          const remaining = Number(booking.total_amount) - clientNet;
          const clientLines = [
            `Bonjour ${u.first_name} ${u.last_name}, votre réservation est confirmée.`,
            `Terrain : ${fieldName}`,
            `Date : ${booking.booking_date} | ${booking.slot_start} - ${booking.slot_end}`,
            `Montant payé : ${clientNet} FCFA`,
            `Frais de service : ${feePaid} FCFA`,
            ...(remaining > 0 ? [`Reste à payer : ${remaining} FCFA`] : []),
          ];
          const clientMsg = clientLines.join('\n');
          await this.notificationsService.sendRawSms(u.phone, clientMsg);
          await this.notificationsService.sendSms(u.id, u.phone, clientMsg);
        }

        await qr.commitTransaction();
        this.paymentGateway.notifyPaymentConfirmed(booking.id);
      } else {
        await qr.manager.update(Payment, payment.id, { status: PaymentStatus.FAILED });
        const booking = await qr.manager.findOne(Booking, {
          where: { id: payment.booking_id },
          relations: ['client', 'client.user'],
        });
        if (booking) {
          await qr.manager.update(Booking, booking.id, { status: BookingStatus.CANCELLED });
          if (booking.client?.user) {
            await this.notificationsService.sendSms(
              booking.client.user.id,
              booking.client.user.phone,
              `Le paiement de votre réservation du ${booking.booking_date} a échoué. Veuillez réessayer.`,
            );
          }
          await qr.commitTransaction();
          this.paymentGateway.notifyPaymentFailed(booking.id);
        } else {
          await qr.commitTransaction();
        }
      }

      return { received: true };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private buildOwnerSms(booking: Booking, payment: Payment): string {
    const dateFormatted = booking.booking_date.split('-').reverse().join('/');
    let durationMin = this.timeToMinutes(booking.slot_end) - this.timeToMinutes(booking.slot_start);
    if (durationMin <= 0) durationMin += 1440;
    const dh = Math.floor(durationMin / 60);
    const dm = durationMin % 60;
    const durationStr = dm === 0 ? `${dh}h` : `${dh}h${String(dm).padStart(2, '0')}`;
    const ref = booking.id.slice(0, 8).toUpperCase();
    const client = booking.client?.user;
    const ownerCredit = Number(payment.amount) - Math.round(Number(payment.amount) * SERVICE_FEE_PERCENT / (1 + SERVICE_FEE_PERCENT));
    const commission = Number(payment.amount) - ownerCredit;
    const remaining = Number(booking.total_amount) - ownerCredit;
    return [
      'Nouvelle réservation confirmée.',
      `Terrain : ${booking.field?.name ?? ''}`,
      `Client : ${client?.first_name ?? ''} ${client?.last_name ?? ''}`,
      `Téléphone : ${client?.phone ?? ''}`,
      `Date : ${dateFormatted}`,
      `Heure : ${booking.slot_start}`,
      `Durée : ${durationStr}`,
      `Montant reçu : ${ownerCredit} FCFA`,
      `Commission EasyArena : ${commission} FCFA`,
      ...(remaining > 0 ? [`Reste à percevoir : ${remaining} FCFA`] : []),
      `Référence : ${ref}`,
    ].join('\n');
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private addMinutes(time: string, minutes: number): string {
    const total = (this.timeToMinutes(time) + minutes) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  }

  private getSlotStarts(booking: Booking): string[] {
    const numSlots = booking.num_slots ?? 1;
    if (numSlots <= 1) return [booking.slot_start];
    let totalMin = this.timeToMinutes(booking.slot_end) - this.timeToMinutes(booking.slot_start);
    if (totalMin <= 0) totalMin += 1440; // midnight crossing
    const perSlotMin = totalMin / numSlots;
    const starts: string[] = [];
    for (let i = 0; i < numSlots; i++) {
      starts.push(this.addMinutes(booking.slot_start, i * perSlotMin));
    }
    return starts;
  }

}
