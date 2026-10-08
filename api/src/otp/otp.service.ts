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

    const code = this.generateOtpCode(length);
    const code_hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expires_at = new Date(Date.now() + expiresInSeconds * 1000);

    await this.otpRepo.save(this.otpRepo.create({ phone, code_hash, expires_at }));

    this.logger.log(
      `[OTP] Code envoyé à ${this.maskPhone(phone)} (valide ${expiresInSeconds}s)`,
    );
    const message = `Votre code de vérification EasyArena est : ${code}. Valide pendant ${expiresInSeconds / 60} minutes.`;
    try {
      await this.notificationsService.sendSms(userId, phone, message);
    } catch (err) {
      // `sendSms` n'échoue ici que si l'écriture du journal d'audit échoue :
      // l'envoi a déjà été tenté. Un envoi de secours doublerait le code OTP.
      // L'OTP lui-même est déjà persisté (etape precedente) et ne depend pas
      // de ce journal : on journalise sans bloquer l'utilisateur.
      this.logger.error(
        `Échec de journalisation de la notification SMS (OTP) pour ${phone}`,
        (err as Error)?.stack ?? String(err),
      );
    }

    return { expires_in: expiresInSeconds };
  }

  async sendResetOtp(phone: string, userId: string): Promise<{ expires_in: number }> {
    const length = this.configService.get<number>('otp.length') ?? 6;
    const expiresInSeconds = 600; // 10 minutes strict validity

    // Invalidate previous unused OTPs
    await this.otpRepo.update({ phone, used: false }, { used: true });

    const code = this.generateOtpCode(length);
    const code_hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expires_at = new Date(Date.now() + expiresInSeconds * 1000);

    await this.otpRepo.save(this.otpRepo.create({ phone, code_hash, expires_at }));

    this.logger.log(
      `[Reset OTP] Code envoyé à ${this.maskPhone(phone)} (valide ${expiresInSeconds}s)`,
    );
    const message = `Votre code de réinitialisation EasyArena est : ${code}. Valable 10 minutes.`;
    try {
      await this.notificationsService.sendSms(userId, phone, message);
    } catch (err) {
      // Idem sendOtp : journal d'audit seul, jamais de second envoi (le
      // destinataire recevrait deux codes et n'utiliserait que le dernier).
      this.logger.error(
        `Échec de journalisation de la notification SMS (OTP reset) pour ${phone}`,
        (err as Error)?.stack ?? String(err),
      );
    }

    return { expires_in: expiresInSeconds };
  }

  /**
   * Code OTP toujours tiré au sort cryptographique.
   *
   * L'ancienne version renvoyait « 123456 » dès que NODE_ENV n'était pas
   * exactement « production » : une seule variable d'environnement oubliée
   * (staging, image Docker, .env local déployé par erreur) rendait tous les
   * OTP du système prévisibles, et donc toutes les réinitialisations de code
   * PIN possibles sans posséder le téléphone.
   *
   * Seul l'environnement de test peut fixer un code, via une variable
   * explicite — jamais la production.
   */
  private generateOtpCode(length: number): string {
    if (this.configService.get<string>('nodeEnv') === 'test') {
      const fixed = process.env.OTP_FIXED_TEST_CODE;
      if (fixed) return fixed;
    }
    return crypto.randomInt(10 ** (length - 1), 10 ** length).toString();
  }

  /** Numéro masqué pour la journalisation : seuls les 4 derniers chiffres. */
  private maskPhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length <= 4) return '****';
    return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
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
