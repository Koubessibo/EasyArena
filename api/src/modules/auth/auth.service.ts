import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { Role, UserStatus } from '../../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { SponsorshipService } from '../sponsorship/sponsorship.service';
import { Client } from '../users/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { Staff } from '../users/entities/staff.entity';
import { OtpCode } from '../../otp/entities/otp-code.entity';
import { OtpService } from '../../otp/otp.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ForgotPinDto } from './dto/forgot-pin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const MAX_LOGIN_ATTEMPTS = 3;
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(OtpCode)
    private readonly otpRepo: Repository<OtpCode>,
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly otpService: OtpService,
    private readonly dataSource: DataSource,
    private readonly sponsorshipService: SponsorshipService,
  ) {}

  private normalizePhone(phone: string): { formattedPhone: string; barePhone: string } {
    const digitsOnly = (phone || '').replace(/\D/g, '');
    const barePhone = digitsOnly.slice(-9);
    const formattedPhone = `+221${barePhone}`;
    return { formattedPhone, barePhone };
  }

  async register(dto: RegisterDto): Promise<{ message: string; expires_in: number }> {
    const { formattedPhone, barePhone } = this.normalizePhone(dto.phone);
    if (!barePhone || barePhone.length < 9) {
      throw new BadRequestException('Numéro de téléphone invalide (au moins 9 chiffres requis).');
    }

    const existing = await this.userRepo.findOne({
      where: [{ phone: formattedPhone }, { phone: barePhone }],
    });
    if (existing) {
      throw new ConflictException('Ce numéro de téléphone est déjà associé à un compte existant.');
    }

    let sponsorUser: User | null = null;
    if (dto.referrer_code) {
      sponsorUser = await this.userRepo.findOne({
        where: { referral_code: dto.referrer_code.toUpperCase() },
      });
    }

    let savedUser: User;
    try {
      await this.dataSource.transaction(async (manager) => {
        const referralCode = await this.generateUniqueReferralCode(dto.first_name, manager);
        const user = manager.create(User, {
          phone: formattedPhone,
          first_name: dto.first_name,
          last_name: dto.last_name,
          email: dto.email,
          role: Role.CLIENT,
          status: UserStatus.PENDING,
          referral_code: referralCode,
          referrer_id: sponsorUser?.id ?? null,
        });
        savedUser = await manager.save(User, user);

        const client = manager.create(Client, { user: savedUser });
        await manager.save(Client, client);

        if (sponsorUser) {
          await this.sponsorshipService.createSponsorshipWithManager(
            sponsorUser.id,
            savedUser.id,
            'client',
            manager,
          );
        }
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.detail?.includes('phone')) {
        throw new ConflictException('Ce numéro de téléphone est déjà associé à un compte existant.');
      }
      throw err;
    }

    await this.sendOtp(savedUser!);

    const expiresIn = this.configService.get<number>('otp.expiresInSeconds') ?? 300;
    return { message: 'OTP sent to your phone', expires_in: expiresIn };
  }

  private async generateUniqueReferralCode(firstName: string, manager: any): Promise<string> {
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const code = this.buildReferralCode(firstName);
      const exists = await manager.findOne(User, { where: { referral_code: code } });
      if (!exists) return code;
    }
    const fallbackCode = this.buildReferralCode('EA' + Date.now().toString(36).slice(-2));
    return fallbackCode;
  }

  private buildReferralCode(firstName: string): string {
    const prefix = (firstName || 'EA').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${suffix}`;
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; expires_in: number }> {
    const { formattedPhone, barePhone } = this.normalizePhone(dto.phone);
    const user = await this.userRepo.findOne({
      where: [{ phone: formattedPhone }, { phone: barePhone }],
    });
    if (!user) {
      throw new NotFoundException('Aucun compte trouvé avec ce numéro de téléphone.');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Ce compte est suspendu. Veuillez contacter le support.');
    }

    const { expires_in } = await this.otpService.sendResetOtp(user.phone, user.id);
    return {
      message: 'Votre code de réinitialisation EasyArena vous a été envoyé par SMS.',
      expires_in,
    };
  }

  async forgotPin(dto: ForgotPinDto): Promise<{ message: string; expires_in: number }> {
    return this.forgotPassword(dto);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean; message: string }> {
    const { formattedPhone, barePhone } = this.normalizePhone(dto.phone);
    const user = await this.userRepo.findOne({
      where: [{ phone: formattedPhone }, { phone: barePhone }],
    });
    if (!user) {
      throw new NotFoundException('Aucun compte trouvé avec ce numéro de téléphone.');
    }

    const newPinOrPass = dto.newPassword || dto.new_password || dto.new_pin || dto.pin;
    if (!newPinOrPass) {
      throw new BadRequestException('Le nouveau mot de passe / code PIN est obligatoire.');
    }

    // 1. Verify OTP with anti-replay check
    const isOtpValid = (await this.otpService.verifyOtp(user.phone, dto.otp)) ||
                       (await this.otpService.verifyOtp(formattedPhone, dto.otp)) ||
                       (await this.otpService.verifyOtp(barePhone, dto.otp));
    if (!isOtpValid) {
      throw new UnauthorizedException('Code OTP invalide ou expiré.');
    }

    // 2. Hash new password with bcrypt
    const pin_hash = await bcrypt.hash(newPinOrPass, SALT_ROUNDS);

    // 3. Update user in database
    await this.userRepo.update(user.id, {
      pin_hash,
      must_change_pin: false,
      login_attempts: 0,
      last_failed_login: undefined,
      status: user.status === UserStatus.PENDING ? UserStatus.ACTIVE : user.status,
    });

    // 4. Send success SMS notification
    const successMsg = "Votre mot de passe EasyArena a été modifié avec succès. Si vous n'êtes pas à l'origine de cette action, contactez le support.";
    try {
      await this.notificationsService.sendSms(user.id, user.phone, successMsg);
    } catch {
      await this.notificationsService.sendRawSms(user.phone, successMsg);
    }

    return {
      success: true,
      message: 'Votre mot de passe a été réinitialisé avec succès.',
    };
  }

  async resendOtp(phone: string): Promise<{ message: string; expires_in: number }> {
    const { formattedPhone, barePhone } = this.normalizePhone(phone);
    const user = await this.userRepo.findOne({
      where: [{ phone: formattedPhone }, { phone: barePhone }, { phone }],
    });
    if (!user) throw new NotFoundException('Phone number not found');
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended');
    }
    await this.sendOtp(user);
    const expiresIn = this.configService.get<number>('otp.expiresInSeconds') ?? 300;
    return { message: 'OTP resent', expires_in: expiresIn };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ message: string }> {
    const { formattedPhone, barePhone } = this.normalizePhone(dto.phone);
    const now = new Date();
    const otp = await this.otpRepo.findOne({
      where: [
        { phone: formattedPhone, used: false, expires_at: MoreThan(now) },
        { phone: barePhone, used: false, expires_at: MoreThan(now) },
        { phone: dto.phone, used: false, expires_at: MoreThan(now) },
      ],
      order: { created_at: 'DESC' },
    });
    if (!otp) throw new UnauthorizedException('Invalid or expired OTP');

    const valid = await bcrypt.compare(dto.code, otp.code_hash);
    if (!valid) throw new UnauthorizedException('Invalid OTP code');

    await this.otpRepo.update(otp.id, { used: true });

    const user = await this.userRepo.findOne({
      where: [{ phone: formattedPhone }, { phone: barePhone }, { phone: dto.phone }],
    });
    if (user && user.status === UserStatus.PENDING) {
      await this.userRepo.update(user.id, { status: UserStatus.ACTIVE });
    }

    return { message: 'Verified. Please set your PIN.' };
  }

  async setPin(dto: SetPinDto) {
    const { formattedPhone, barePhone } = this.normalizePhone(dto.phone);
    const user = await this.userRepo.findOne({
      where: [
        { phone: formattedPhone, status: UserStatus.ACTIVE },
        { phone: barePhone, status: UserStatus.ACTIVE },
        { phone: dto.phone, status: UserStatus.ACTIVE },
      ],
      relations: ['client', 'owner', 'vendor'],
    });
    if (!user) throw new NotFoundException('Active user not found for this phone');

    const pin_hash = await bcrypt.hash(dto.pin, SALT_ROUNDS);
    await this.userRepo.update(user.id, { pin_hash, must_change_pin: false });

    user.pin_hash = pin_hash;
    return this.generateTokenResponse(user);
  }

  async login(dto: LoginDto) {
    const { formattedPhone, barePhone } = this.normalizePhone(dto.phone);

    const userSelect: (keyof User)[] = [
      'id', 'phone', 'first_name', 'last_name', 'email', 'profile_photo',
      'role', 'status', 'pin_hash', 'login_attempts', 'last_failed_login',
      'must_change_pin', 'created_at', 'updated_at',
    ];
    const userRelations = ['client', 'owner', 'vendor'];

    // Prefer the CLIENT account when the same phone is registered under multiple roles
    let user = await this.userRepo.findOne({
      where: [
        { phone: formattedPhone, role: Role.CLIENT },
        { phone: barePhone, role: Role.CLIENT },
        { phone: dto.phone, role: Role.CLIENT },
      ],
      select: userSelect,
      relations: userRelations,
    });
    if (!user) {
      user = await this.userRepo.findOne({
        where: [
          { phone: formattedPhone },
          { phone: barePhone },
          { phone: dto.phone },
        ],
        select: userSelect,
        relations: userRelations,
      });
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended');
    }
    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('Account is not verified');
    }
    if (!user.pin_hash) {
      throw new UnauthorizedException('PIN not set. Please complete registration.');
    }

    const valid = await bcrypt.compare(dto.pin, user.pin_hash);
    if (!valid) {
      const attempts = (user.login_attempts ?? 0) + 1;
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        await this.userRepo.update(user.id, {
          status: UserStatus.SUSPENDED,
          login_attempts: attempts,
          last_failed_login: new Date(),
        });
        await this.notificationsService.sendSms(
          user.id,
          user.phone,
          'Votre compte EasyArena a été suspendu en raison de trop nombreuses tentatives de connexion échouées.',
        );
        throw new UnauthorizedException('Account suspended due to too many failed attempts');
      }
      await this.userRepo.update(user.id, {
        login_attempts: attempts,
        last_failed_login: new Date(),
      });
      throw new UnauthorizedException(`Invalid PIN. ${MAX_LOGIN_ATTEMPTS - attempts} attempt(s) remaining`);
    }

    await this.userRepo.update(user.id, { login_attempts: 0, last_failed_login: undefined });

    if (user.must_change_pin) {
      await this.sendOtp(user);
      return { must_change_pin: true, phone: user.phone };
    }

    return this.generateTokenResponse(user);
  }

  async refreshToken(refresh_token: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refresh_token, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ['client', 'owner', 'vendor'],
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status}`);
    }

    const access_token = this.signAccessToken(user);
    return { access_token };
  }

  async changePin(user: User, dto: ChangePinDto): Promise<{ message: string }> {
    const fullUser = await this.userRepo.findOne({
      where: { id: user.id },
      select: ['id', 'pin_hash'],
    });
    if (!fullUser?.pin_hash) throw new BadRequestException('PIN not set');

    const valid = await bcrypt.compare(dto.old_pin, fullUser.pin_hash);
    if (!valid) throw new UnauthorizedException('Old PIN is incorrect');

    const pin_hash = await bcrypt.hash(dto.new_pin, SALT_ROUNDS);
    await this.userRepo.update(user.id, { pin_hash });
    return { message: 'PIN changed successfully' };
  }

  private async sendOtp(user: User): Promise<void> {
    await this.otpService.sendOtp(user.phone, user.id);
  }

  private signAccessToken(user: User): string {
    const payload: JwtPayload = { sub: user.id, phone: user.phone, role: user.role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.jwtService.sign(payload as any, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn') as any,
    });
  }

  private signRefreshToken(user: User): string {
    const payload: JwtPayload = { sub: user.id, phone: user.phone, role: user.role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.jwtService.sign(payload as any, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
    });
  }

  async getMe(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const { pin_hash: _pin, ...safeUser } = user as User & { pin_hash?: string };
    void _pin;
    return safeUser;
  }

  async updateMe(userId: string, dto: { first_name?: string; last_name?: string; email?: string; profile_photo?: string }) {
    const updates: Partial<User> = {};
    if (dto.first_name !== undefined) updates.first_name = dto.first_name;
    if (dto.last_name !== undefined) updates.last_name = dto.last_name;
    if (dto.email !== undefined) updates.email = dto.email;
    if (dto.profile_photo !== undefined) updates.profile_photo = dto.profile_photo;

    if (Object.keys(updates).length) {
      await this.userRepo.update(userId, updates);
    }

    return this.getMe(userId);
  }

  private async generateTokenResponse(user: User) {
    const { pin_hash: _pin, ...safeUser } = user as User & { pin_hash?: string };
    void _pin;
    let can_withdraw: boolean | undefined;
    if (user.role === Role.CONTROLLER) {
      const staff = await this.staffRepo.findOne({ where: { user: { id: user.id } } });
      can_withdraw = staff?.can_withdraw ?? false;
    }
    return {
      access_token: this.signAccessToken(user),
      refresh_token: this.signRefreshToken(user),
      user: { ...safeUser, ...(can_withdraw !== undefined ? { can_withdraw } : {}) },
    };
  }
}
