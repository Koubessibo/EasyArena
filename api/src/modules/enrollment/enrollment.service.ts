import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentRequest } from './entities/enrollment-request.entity';
import { CreateEnrollmentRequestDto } from './dto/create-enrollment-request.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(EnrollmentRequest)
    private readonly repo: Repository<EnrollmentRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateEnrollmentRequestDto): Promise<EnrollmentRequest> {
    const existingUser = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (existingUser) {
      throw new ConflictException('Un compte avec ce numéro existe déjà');
    }

    const pendingConflict = await this.repo.findOne({
      where: { phone: dto.phone, status: 'pending' },
    });
    if (pendingConflict) {
      throw new ConflictException('Une demande est déjà en cours pour ce numéro');
    }

    const request = this.repo.create({ ...dto, status: 'pending' });
    const saved = await this.repo.save(request);

    const superAdminPhone = this.configService.get<string>('superAdminPhone');
    if (superAdminPhone) {
      const roleLabel = dto.role === 'owner' ? 'Administrateur Terrain' : 'Vendeur';
      const smsMessage =
        `[EasyArena] Nouvelle demande d'inscription reçue.\n` +
        `Nom : ${dto.first_name} ${dto.last_name}\n` +
        `Téléphone : ${dto.phone}\n` +
        `Rôle : ${roleLabel}\n` +
        `Connectez-vous à l'application pour valider ou rejeter cette demande.`;

      this.notificationsService.sendRawSms(superAdminPhone, smsMessage).catch(() => {});
    }

    return saved;
  }

  async findAll(status?: string): Promise<EnrollmentRequest[]> {
    const where = status ? { status: status as any } : {};
    return this.repo.find({ where, order: { created_at: 'DESC' } });
  }

  async approve(id: string): Promise<{ temp_pin: string }> {
    const request = await this.repo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (request.status !== 'pending') {
      throw new ConflictException('Cette demande a déjà été traitée');
    }

    let created: { user: User; temp_pin: string };

    if (request.role === 'owner') {
      created = await this.usersService.createOwner({
        phone: request.phone,
        first_name: request.first_name,
        last_name: request.last_name,
        mobile_money: request.mobile_money,
        bank_account: request.bank_account,
      });
    } else {
      created = await this.usersService.createVendor({
        phone: request.phone,
        first_name: request.first_name,
        last_name: request.last_name,
        shop_name: request.shop_name ?? request.first_name,
        contact_phone: request.contact_phone ?? request.phone,
        location: request.location,
      });
    }

    request.status = 'approved';
    request.reviewed_at = new Date();
    await this.repo.save(request);

    const roleLabel = request.role === 'owner' ? 'Administrateur Terrain' : 'Vendeur';
    const message =
      `Bienvenue sur EasyArena !\n` +
      `Votre profil ${roleLabel} a été validé avec succès.\n` +
      `Identifiant : ${request.phone}\n` +
      `Code PIN provisoire : ${created.temp_pin}\n` +
      `Connectez-vous sur https://easyarena221.com/ pour accéder à votre espace.`;

    await this.notificationsService.sendRawSms(request.phone, message);
    await this.notificationsService.sendSms(created.user.id, request.phone, message);

    return { temp_pin: created.temp_pin };
  }

  async reject(id: string, rejection_note?: string): Promise<EnrollmentRequest> {
    const request = await this.repo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (request.status !== 'pending') {
      throw new ConflictException('Cette demande a déjà été traitée');
    }

    request.status = 'rejected';
    request.rejection_note = rejection_note;
    request.reviewed_at = new Date();
    return this.repo.save(request);
  }
}
