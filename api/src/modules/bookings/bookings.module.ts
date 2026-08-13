import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { CancellationRequest } from './entities/cancellation-request.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Field } from '../fields/entities/field.entity';
import { FieldSchedule } from '../fields/entities/field-schedule.entity';
import { Owner } from '../users/entities/owner.entity';
import { Staff } from '../users/entities/staff.entity';
import { Payment } from '../payments/entities/payment.entity';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, CancellationRequest, Field, FieldSchedule, Owner, Staff, Payment]),
    UsersModule,
    PaymentsModule,
    TransactionsModule,
    NotificationsModule,
  ],
  providers: [BookingsService],
  controllers: [BookingsController],
  exports: [BookingsService, TypeOrmModule],
})
export class BookingsModule {}
