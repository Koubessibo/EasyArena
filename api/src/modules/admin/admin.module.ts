import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { User } from '../users/entities/user.entity';
import { Field } from '../fields/entities/field.entity';
import { Article } from '../articles/entities/article.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersModule } from '../users/users.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { SponsorshipModule } from '../sponsorship/sponsorship.module';

import { PlatformWithdrawal } from './entities/platform-withdrawal.entity';

import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Field, Article, Booking, Transaction, PlatformWithdrawal]),
    UsersModule,
    WithdrawalsModule,
    NotificationsModule,
    EnrollmentModule,
    SponsorshipModule,
    PaymentsModule,
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
