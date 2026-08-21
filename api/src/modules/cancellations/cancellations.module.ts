import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CancellationsController } from './cancellations.controller';
import { CancellationsService } from './cancellations.service';
import { Booking } from '../bookings/entities/booking.entity';
import { UsersModule } from '../users/users.module';
import { SponsorshipModule } from '../sponsorship/sponsorship.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    UsersModule,
    SponsorshipModule,
  ],
  controllers: [CancellationsController],
  providers: [CancellationsService],
  exports: [CancellationsService],
})
export class CancellationsModule {}
