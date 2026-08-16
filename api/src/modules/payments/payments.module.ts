import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { Booking } from '../bookings/entities/booking.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { IotModule } from '../iot/iot.module';
import { SamirpayProvider } from './providers/samirpay.provider';
import { MockPaymentProvider } from './providers/mock.provider';
import { PaymentProviderFactory } from './factories/payment-provider.factory';
import { PaymentGateway } from './payment.gateway';

import { Owner } from '../users/entities/owner.entity';
import { ReconciliationService } from './reconciliation.service';
import { SponsorshipModule } from '../sponsorship/sponsorship.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Booking, Owner]),
    TransactionsModule,
    NotificationsModule,
    UsersModule,
    IotModule,
    SponsorshipModule,
  ],
  providers: [PaymentsService, SamirpayProvider, MockPaymentProvider, PaymentProviderFactory, PaymentGateway, ReconciliationService],
  controllers: [PaymentsController],
  exports: [PaymentsService, PAYMENT_PROVIDER, PaymentGateway, ReconciliationService],
})
export class PaymentsModule {}
