import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { Staff } from '../users/entities/staff.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { RecipientsResolver } from './recipients.resolver';
import { MTargetProvider } from './providers/mtarget.provider';
import { MockSmsProvider } from './providers/mock.provider';
import { SmsProviderFactory } from './factories/sms-provider.factory';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, Staff]),
    // Le gateway vérifie le JWT lui-même (handshake) : JwtService sans
    // stratégie par défaut, le secret est passé explicitement à verifyAsync.
    JwtModule.register({}),
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    RecipientsResolver,
    MTargetProvider,
    MockSmsProvider,
    SmsProviderFactory,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, RecipientsResolver],
})
export class NotificationsModule {}
