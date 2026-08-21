import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TotpService } from './totp.service';
import { EventTicket } from './entities/event-ticket.entity';
import { SportEvent } from '../events/entities/sport-event.entity';
import { Client } from '../users/entities/client.entity';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { SponsorshipModule } from '../sponsorship/sponsorship.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventTicket, SportEvent, Client]),
    UsersModule,
    PaymentsModule,
    NotificationsModule,
    SponsorshipModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TotpService],
  exports: [TicketsService, TotpService],
})
export class TicketsModule {}
