import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CancellationsController } from './cancellations.controller';
import { CancellationsService } from './cancellations.service';
import { Booking } from '../bookings/entities/booking.entity';
import { UsersModule } from '../users/users.module';
import { SponsorshipModule } from '../sponsorship/sponsorship.module';
import { TransactionsModule } from '../transactions/transactions.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    UsersModule,
    SponsorshipModule,
    // TransactionsService : référence centralisée + solde du partenaire
    TransactionsModule,
  ],
  controllers: [CancellationsController],
  providers: [CancellationsService],
  exports: [CancellationsService],
})
export class CancellationsModule {}
