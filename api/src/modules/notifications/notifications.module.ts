import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MTargetProvider } from './providers/mtarget.provider';
import { MockSmsProvider } from './providers/mock.provider';
import { SmsProviderFactory } from './factories/sms-provider.factory';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [
    NotificationsService,
    MTargetProvider,
    MockSmsProvider,
    SmsProviderFactory,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
