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
import { DataSource, Repository, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
import {
  BookingStatus,
  CancellationRequestStatus,
  FieldStatus,
  PaymentStatus,
  Role,
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
} from '../../common/enums';
import { Field } from '../fields/entities/field.entity';
import { FieldSchedule } from '../fields/entities/field-schedule.entity';
import { Client } from '../users/entities/client.entity';
import { Owner } from '../users/entities/owner.entity';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';
import { CancellationRequest } from './entities/cancellation-request.entity';
import { CreateCancelRequestDto, ValidateCancelRequestDto } from './dto/cancel-request.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';

const SERVICE_FEE_PERCENT = 0.05;
const BOOKING_EXPIRY_HOURS = 24;
const REFUND_FEE_PERCENT = 0.01;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Field) private readonly fieldRepo: Repository<Field>,
    @InjectRepository(FieldSchedule) private readonly scheduleRepo: Repository<FieldSchedule>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(CancellationRequest) private readonly cancelRepo: Repository<CancellationRequest>,
    @InjectRepository(Owner) private readonly ownerRepo: Repository<Owner>,
    @InjectRepository(Staff) private readonly staffRepo: Repository<Staff>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  private async resolveOwnerId(user: User): Promise<string> {
    if (user.role === Role.FIELD_ADMIN || user.role === Role.CONTROLLER) {
      const staff = await this.staffRepo.findOne({ where: { user: { id: user.id } } });
      if (!staff) throw new NotFoundException('Staff profile not found');
      return staff.owner_id;
    }
    const owner = await this.ownerRepo.findOne({ where: { user: { id: user.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');
    return owner.id;
  }

  async createBooking(user: User, dto: CreateBookingDto) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const field = await qr.manager.findOne(Field, { where: { id: dto.field_id } });
      if (!field) throw new NotFoundException('Field not found');
      if (field.status !== FieldStatus.AVAILABLE) {
        throw new BadRequestException('Field is not available');
      }

      const schedule = await qr.manager.findOne(FieldSchedule, {
        where: { id: dto.schedule_id, field_id: dto.field_id },
        lock: { mode: 'pessimistic_write' }, // Pessimistic Lock to prevent Double-Booking (Race Condition)
      });
      if (!schedule) throw new NotFoundException('Schedule not found for this field');

      const numSlots = dto.num_slots ?? 1;
      const allSlotStarts: string[] = [];
      for (let i = 0; i < numSlots; i++) {
        allSlotStarts.push(this.addMinutes(dto.slot_start, i * schedule.slot_duration_min));
      }

      const client = await qr.manager.findOne(Client, { where: { user: { id: user.id } } });
      if (!client) throw new NotFoundException('Client profile not found');

      // 1. If the user already has a pending booking for the same slot with the same num_slots, resume it
      const ownPending = await qr.manager.findOne(Booking, {
        where: {
          field_id: dto.field_id,
          booking_date: dto.booking_date,
          slot_start: dto.slot_start,
          client_id: client.id,
          status: BookingStatus.PENDING_PAYMENT,
          num_slots: numSlots,
        },
      });
      if (ownPending && new Date() < ownPending.expires_at) {
        await qr.rollbackTransaction();
        await qr.release();
        return this.bookingRepo.findOne({
          where: { id: ownPending.id },
          relations: ['field', 'field.photos'],
        });
      }

      // 2. Check each slot in the range for confirmed or pending conflicts from OTHER users
      for (const slotStart of allSlotStarts) {
        const conflict = await qr.manager.findOne(Booking, {
          where: {
            field_id: dto.field_id,
            schedule_id: dto.schedule_id,
            booking_date: dto.booking_date,
            slot_start: slotStart,
            status: In([BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT]),
          },
        });
        if (conflict) throw new ConflictException(`Slot ${slotStart} is already booked or reserved pending payment`);
      }

      const now = new Date();
      const slotEnd = this.addMinutes(dto.slot_start, schedule.slot_duration_min * numSlots);
      const total_amount = Number(schedule.price_per_slot) * numSlots;
      const service_fee = Math.round(total_amount * SERVICE_FEE_PERCENT);
      const expires_at = new Date(now.getTime() + BOOKING_EXPIRY_HOURS * 60 * 60 * 1000);
      const min_deposit_amount = schedule.deposit_per_slot != null
        ? Number(schedule.deposit_per_slot) * numSlots
        : null;

      const booking = await qr.manager.save(
        qr.manager.create(Booking, {
          client_id: client.id,
          field_id: dto.field_id,
          schedule_id: dto.schedule_id,
          booking_date: dto.booking_date,
          slot_start: dto.slot_start,
          slot_end: slotEnd,
          num_slots: numSlots,
          total_amount,
          service_fee,
          min_deposit_amount,
          status: BookingStatus.PENDING_PAYMENT,
          expires_at,
        }),
      );

      await qr.commitTransaction();
      return this.bookingRepo.findOne({
        where: { id: booking.id },
        relations: ['field', 'field.photos'],
      });
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getClientBookings(user: User, query: BookingQueryDto) {
    const client = await this.clientRepo.findOne({ where: { user: { id: user.id } } });
    if (!client) throw new NotFoundException('Client profile not found');

    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;

    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('field.photos', 'photo', 'photo.is_cover = true')
      .leftJoinAndSelect('booking.payment', 'payment')
      .where('booking.client_id = :clientId', { clientId: client.id });

    if (query.status) {
      qb.andWhere('booking.status = :status', { status: query.status });
    } else {
      qb.andWhere('booking.status NOT IN (:...excluded)', {
        excluded: [BookingStatus.PENDING_PAYMENT, BookingStatus.EXPIRED],
      });
    }
    qb.orderBy('booking.created_at', 'DESC').skip((page - 1) * perPage).take(perPage);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, per_page: perPage };
  }

  async getOwnerBookings(user: User, query: BookingQueryDto) {
    const ownerId = await this.resolveOwnerId(user);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;

    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('client.user', 'clientUser')
      .leftJoinAndSelect('booking.payment', 'payment')
      .where('field.owner_id = :ownerId', { ownerId });

    if (query.status) qb.andWhere('booking.status = :status', { status: query.status });
    if (query.field_id) qb.andWhere('booking.field_id = :fieldId', { fieldId: query.field_id });
    if (query.date) qb.andWhere('booking.booking_date = :date', { date: query.date });

    qb.orderBy('booking.created_at', 'DESC').skip((page - 1) * perPage).take(perPage);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, per_page: perPage };
  }

  async getBookingById(user: User, id: string) {
    if (user.role === Role.CLIENT) {
      const client = await this.clientRepo.findOne({ where: { user: { id: user.id } } });
      if (!client) throw new NotFoundException('Booking not found');

      const booking = await this.bookingRepo.findOne({
        where: { id, client_id: client.id },
        relations: ['field', 'field.photos', 'client', 'client.user', 'payment'],
      });
      if (!booking) throw new NotFoundException('Booking not found');
      return booking;
    }

    if (
      user.role === Role.OWNER ||
      user.role === Role.FIELD_ADMIN ||
      user.role === Role.CONTROLLER
    ) {
      const ownerId = await this.resolveOwnerId(user);
      const booking = await this.bookingRepo.findOne({
        where: { id, field: { owner_id: ownerId } },
        relations: ['field', 'field.photos', 'client', 'client.user', 'payment'],
      });
      if (!booking) throw new NotFoundException('Booking not found');
      return booking;
    }

    if (user.role === Role.ADMIN) {
      const booking = await this.bookingRepo.findOne({
        where: { id },
        relations: ['field', 'field.photos', 'client', 'client.user', 'payment'],
      });
      if (!booking) throw new NotFoundException('Booking not found');
      return booking;
    }

    throw new NotFoundException('Booking not found');
  }

  // ── Cancellation requests ──────────────────────────────────────────────

  async requestCancellation(user: User, bookingId: string, dto: CreateCancelRequestDto) {
    const booking = await this.getBookingById(user, bookingId);

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Seules les réservations confirmées peuvent être annulées.');
    }

    const existing = await this.cancelRepo.findOne({
      where: { booking_id: bookingId, status: CancellationRequestStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException('Une demande d\'annulation est déjà en cours pour cette réservation.');
    }

    const request = this.cancelRepo.create({
      booking_id: bookingId,
      reason: dto.reason,
      status: CancellationRequestStatus.PENDING,
    });
    return this.cancelRepo.save(request);
  }

  async getCancellationRequest(user: User, bookingId: string) {
    // Ensure user owns this booking
    await this.getBookingById(user, bookingId);

    return this.cancelRepo.findOne({
      where: { booking_id: bookingId },
      order: { requested_at: 'DESC' },
    });
  }

  async getOwnerCancellationRequests(user: User) {
    const ownerId = await this.resolveOwnerId(user);

    return this.cancelRepo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.booking', 'booking')
      .leftJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('client.user', 'clientUser')
      .where('field.owner_id = :ownerId', { ownerId })
      .orderBy('cr.requested_at', 'DESC')
      .getMany();
  }

  async validateCancellationRequest(user: User, requestId: string, dto: ValidateCancelRequestDto) {
    const ownerId = await this.resolveOwnerId(user);

    const request = await this.cancelRepo.findOne({
      where: { id: requestId },
      relations: ['booking', 'booking.field', 'booking.payment', 'booking.client', 'booking.client.user'],
    });
    if (!request || request.booking?.field?.owner_id !== ownerId) {
      throw new NotFoundException('Cancellation request not found');
    }
    if (request.status !== CancellationRequestStatus.PENDING) {
      throw new BadRequestException('Cette demande a déjà été traitée.');
    }

    // ── Rejection ──
    if (dto.action !== 'approve') {
      request.status = CancellationRequestStatus.REJECTED;
      request.rejection_note = dto.rejection_note || '';
      request.processed_at = new Date();
      request.processed_by = user.id;
      return this.cancelRepo.save(request);
    }

    // ── Approval with automatic refund ──
    const booking = request.booking;
    const payment = booking.payment;

    // Verify booking has not been consumed yet
    const now = new Date();
    const [year, month, day] = booking.booking_date.split('-').map(Number);
    const [endH, endM] = booking.slot_end.split(':').map(Number);
    const bookingEnd = new Date(year, month - 1, day, endH, endM);
    if (now >= bookingEnd) {
      throw new BadRequestException('Impossible d\'annuler une réservation déjà consommée.');
    }

    // Calculate refund: 99% of total_amount (1% fee retained)
    const refundAmount = Math.round(Number(booking.total_amount) * (1 - REFUND_FEE_PERCENT));

    // Check owner balance
    const ownerBalance = await this.transactionsService.computeOwnerBalance(ownerId);
    if (ownerBalance < refundAmount) {
      throw new BadRequestException(
        `Solde insuffisant pour le remboursement. Solde : ${ownerBalance} FCFA, Remboursement : ${refundAmount} FCFA.`,
      );
    }

    // Phase 1: DB transaction — debit owner + approve + cancel booking
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const balanceBefore = await this.transactionsService.computeOwnerBalance(ownerId, qr.manager);

      await this.transactionsService.createTransaction(
        {
          owner_id: ownerId,
          type: TransactionType.REFUND_DEBIT,
          direction: TransactionDirection.DEBIT,
          amount: refundAmount,
          balance_before: balanceBefore,
          source_id: payment?.id ?? booking.id,
          source_type: TransactionSourceType.REFUND,
          description: `Remboursement annulation réservation ${booking.id}`,
        },
        qr.manager,
      );

      await qr.manager.update(Booking, booking.id, { status: BookingStatus.CANCELLED });
      await qr.manager.update(CancellationRequest, request.id, {
        status: CancellationRequestStatus.APPROVED,
        processed_at: now,
        processed_by: user.id,
      });

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // Phase 2: CashOut AFTER commit (if payment has operator info)
    if (payment?.operator && payment?.phone_number) {
      try {
        const cashOutResult = await this.paymentProvider.cashOut({
          amount: refundAmount,
          operator: payment.operator,
          phoneNumber: payment.phone_number,
          reference: `REFUND-${booking.id}`,
        });

        if (!cashOutResult.success) {
          throw new Error(`CashOut échoué: ${cashOutResult.message}`);
        }

        this.logger.log(`Refund cashOut OK for booking ${booking.id}: ${refundAmount} FCFA`);

        // SMS to client
        if (booking.client?.user) {
          await this.notificationsService.sendSms(
            booking.client.user.id,
            booking.client.user.phone,
            `Votre réservation du ${booking.booking_date} a été annulée. Un remboursement de ${refundAmount} FCFA a été envoyé sur votre compte ${payment.operator}.`,
          );
        }
      } catch (cashOutError: any) {
        this.logger.error(`Refund cashOut FAILED for booking ${booking.id}: ${cashOutError.message}`);

        // Compensation: credit back the owner
        const mgr = this.dataSource.manager;
        const balanceAfterDebit = await this.transactionsService.computeOwnerBalance(ownerId);
        await this.transactionsService.createTransaction(
          {
            owner_id: ownerId,
            type: TransactionType.REFUND_CREDIT,
            direction: TransactionDirection.CREDIT,
            amount: refundAmount,
            balance_before: balanceAfterDebit,
            source_id: payment?.id ?? booking.id,
            source_type: TransactionSourceType.REFUND,
            description: `Compensation: échec remboursement réservation ${booking.id}`,
          },
          mgr,
        );

        // SMS error to client
        if (booking.client?.user) {
          await this.notificationsService.sendSms(
            booking.client.user.id,
            booking.client.user.phone,
            `Votre réservation du ${booking.booking_date} a été annulée. Le remboursement automatique a échoué, veuillez contacter le support.`,
          );
        }
      }
    } else {
      // No payment info — just notify cancellation without refund
      if (booking.client?.user) {
        await this.notificationsService.sendSms(
          booking.client.user.id,
          booking.client.user.phone,
          `Votre réservation du ${booking.booking_date} a été annulée.`,
        );
      }
    }

    // Return updated request
    return this.cancelRepo.findOne({
      where: { id: requestId },
      relations: ['booking'],
    });
  }

  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = (h * 60 + m + minutes) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  }
}
