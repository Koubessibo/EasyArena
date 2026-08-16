import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration, { validationSchema } from './config/configuration';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppController } from './app.controller';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FieldsModule } from './modules/fields/fields.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { CancellationsModule } from './modules/cancellations/cancellations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EventsModule } from './modules/events/events.module';
import { ScheduleModule } from '@nestjs/schedule';
// BullModule + IotModule disabled: ioredis-mock does not support brpop (blocks event loop)
// import { BullModule } from '@nestjs/bull';
// import { IotModule } from './modules/iot/iot.module';
// const RedisMock = require('ioredis-mock');
import { TicketsModule } from './modules/tickets/tickets.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { VendorEarningsModule } from './modules/vendor-earnings/vendor-earnings.module';
import { SponsorshipModule } from './modules/sponsorship/sponsorship.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: config.get<string>('nodeEnv') !== 'production',
        migrationsRun: false,
        logging: config.get<string>('nodeEnv') === 'development',
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 60 }]),
    AuthModule,
    UsersModule,
    FieldsModule,
    BookingsModule,
    PaymentsModule,
    TransactionsModule,
    WithdrawalsModule,
    ArticlesModule,
    NotificationsModule,
    StorageModule,
    AdminModule,
    EnrollmentModule,
    SubscriptionsModule,
    CancellationsModule,
    ReportsModule,
    EventsModule,
    TicketsModule,
    ProductsModule,
    OrdersModule,
    VendorEarningsModule,
    SponsorshipModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
