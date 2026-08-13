import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { User } from '../users/entities/user.entity';
import { Staff } from '../users/entities/staff.entity';
import { OtpCode } from '../../otp/entities/otp-code.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../../otp/otp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpCode, Staff]),
    PassportModule,
    JwtModule.register({}),
    NotificationsModule,
    OtpModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService],
})
export class AuthModule {}
