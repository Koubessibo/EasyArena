import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpCode } from './entities/otp-code.entity';
import { OtpService } from './otp.service';
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([OtpCode]), NotificationsModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
