import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MoreThan, Repository } from 'typeorm';
import { OtpCode } from './entities/otp-code.entity';
import { NotificationsService } from '../modules/notifications/notifications.service';

const SALT_ROUNDS = 10;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpCode)
    private readonly otpRepo: Repository<OtpCode>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendOtp(phone: string, userId: string): Promise<{ expires_in: number }> {
    const length = this.configService.get<number>('otp.length') ?? 6;
    const expiresInSeconds = this.configService.get<number>('otp.expiresInSeconds') ?? 300;

    // Invalidate previous unused OTPs
    await this.otpRepo.update({ phone, used: false }, { used: true });

    const code =
      process.env.NODE_ENV === 'production'
        ? crypto.randomInt(10 ** (length - 1), 10 ** length).toString()
        : '123456';
    const code_hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expires_at = new Date(Date.now() + expiresInSeconds * 1000);

    await this.otpRepo.save(this.otpRepo.create({ phone, code_hash, expires_at }));

    this.logger.log(`[OTP] ${phone} → ${code}`);
    const message = `Votre code de vérification EasyArena est : ${code}. Valide pendant ${expiresInSeconds / 60} minutes.`;
    try {
      await this.notificationsService.sendSms(userId, phone, message);
    } catch {
      await this.notificationsService.sendRawSms(phone, message);
    }

    return { expires_in: expiresInSeconds };
  }

  async sendResetOtp(phone: string, userId: string): Promise<{ expires_in: number }> {
    const length = this.configService.get<number>('otp.length') ?? 6;
    const expiresInSeconds = 600; // 10 minutes strict validity

    // Invalidate previous unused OTPs
    await this.otpRepo.update({ phone, used: false }, { used: true });

    const code =
      process.env.NODE_ENV === 'production'
        ? crypto.randomInt(10 ** (length - 1), 10 ** length).toString()
        : '123456';
    const code_hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expires_at = new Date(Date.now() + expiresInSeconds * 1000);

    await this.otpRepo.save(this.otpRepo.create({ phone, code_hash, expires_at }));

    this.logger.log(`[Reset OTP] ${phone} → ${code}`);
    const message = `Votre code de réinitialisation EasyArena est : ${code}. Valable 10 minutes.`;
    try {
      await this.notificationsService.sendSms(userId, phone, message);
    } catch {
      await this.notificationsService.sendRawSms(phone, message);
    }

    return { expires_in: expiresInSeconds };
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const now = new Date();
    const otp = await this.otpRepo.findOne({
      where: { phone, used: false, expires_at: MoreThan(now) },
      order: { created_at: 'DESC' },
    });
    if (!otp) return false;

    const valid = await bcrypt.compare(code, otp.code_hash);
    if (!valid) return false;

    await this.otpRepo.update(otp.id, { used: true });
    return true;
  }

  /**
   * Verify OTP or throw UnauthorizedException.
   */
  async verifyOtpOrThrow(phone: string, code: string): Promise<void> {
    const valid = await this.verifyOtp(phone, code);
    if (!valid) {
      throw new UnauthorizedException('Code OTP invalide ou expiré');
    }
  }
}
