import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SponsorshipService } from './sponsorship.service';
import { SponsorshipController } from './sponsorship.controller';
import { Sponsorship } from './entities/sponsorship.entity';
import { SponsorshipCommission } from './entities/sponsorship-commission.entity';
import { SponsorshipWithdrawal } from './entities/sponsorship-withdrawal.entity';
import { User } from '../users/entities/user.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../../otp/otp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sponsorship,
      SponsorshipCommission,
      SponsorshipWithdrawal,
      User,
    ]),
    TransactionsModule,
    NotificationsModule,
    OtpModule,
  ],
  controllers: [SponsorshipController],
  providers: [SponsorshipService],
  exports: [SponsorshipService],
})
export class SponsorshipModule {}
