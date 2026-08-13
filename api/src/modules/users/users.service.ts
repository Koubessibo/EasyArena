import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, FindManyOptions, ILike, Repository } from 'typeorm';
import { Role, UserStatus } from '../../common/enums';
import { User } from './entities/user.entity';
import { Owner } from './entities/owner.entity';
import { Vendor } from './entities/vendor.entity';
import { Staff } from './entities/staff.entity';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { NotificationsService } from '../notifications/notifications.service';

import { Client } from './entities/client.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Owner)
    private readonly ownerRepo: Repository<Owner>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string, relations?: string[]): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: relations ?? [],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async listUsers(filters: {
    role?: Role;
    status?: UserStatus;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ data: User[]; total: number }> {
    const page = filters.page ?? 1;
    const perPage = filters.per_page ?? 20;

    const where: FindManyOptions<User>['where'] = {};
    if (filters.role) where['role'] = filters.role;
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['phone'] = ILike(`%${filters.search}%`);
    }

    const [data, total] = await this.userRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { data, total };
  }

  async createOwner(dto: CreateOwnerDto): Promise<{ user: User; temp_pin: string }> {
    const existing = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Phone number already registered');

    const tempPin = '0000';
    const pin_hash = await bcrypt.hash(tempPin, 10);

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          phone: dto.phone,
          first_name: dto.first_name,
          last_name: dto.last_name,
          role: Role.OWNER,
          status: UserStatus.ACTIVE,
          pin_hash,
          must_change_pin: true,
        }),
      );
      await manager.save(
        manager.create(Owner, {
          user,
          mobile_money: dto.mobile_money,
          bank_account: dto.bank_account,
        }),
      );
      return { user, temp_pin: tempPin };
    });
  }

  async createVendor(dto: CreateVendorDto): Promise<{ user: User; temp_pin: string }> {
    const existing = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Phone number already registered');

    const tempPin = '0000';
    const pin_hash = await bcrypt.hash(tempPin, 10);

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          phone: dto.phone,
          first_name: dto.first_name,
          last_name: dto.last_name,
          role: Role.VENDOR,
          status: UserStatus.ACTIVE,
          pin_hash,
          must_change_pin: true,
        }),
      );
      await manager.save(
        manager.create(Vendor, {
          user,
          shop_name: dto.shop_name,
          contact_phone: dto.contact_phone,
          location: dto.location,
        }),
      );
      return { user, temp_pin: tempPin };
    });
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findById(id);
    user.status = status;
    return this.userRepo.save(user);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.userRepo.remove(user);
  }

  // ── Invitation / Parrainage ────────────────────────────────────────────────

  /**
   * Crée un compte «invité» avec statut PENDING.
   * L'invité devra activer son compte via le flux OTP/PIN.
   *
   * @param dto  - Données de l'invité + referrer_id du parrain (admin connecté)
   * @returns Réponse formatée { success, message, data } prête pour Angular
   */
  async inviteUser(
    dto: InviteUserDto,
  ): Promise<{ success: boolean; message: string; data: Partial<User> }> {
    // ── 1. Vérification d'unicité du téléphone ─────────────────────────────
    const existingPhone = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException(
        `Un compte avec le numéro ${dto.phone} existe déjà.`,
      );
    }

    // ── 2. Vérification d'unicité de l'email (si fourni) ──────────────────
    if (dto.email) {
      const existingEmail = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException(
          `Un compte avec l'adresse ${dto.email} existe déjà.`,
        );
      }
    }

    // ── 3. PIN temporaire — l'invité devra le changer à la 1ère connexion ──
    const tempPin = Math.floor(1000 + Math.random() * 9000).toString();
    const pin_hash = await bcrypt.hash(tempPin, 10);

    // ── 4. Création en base ────────────────────────────────────────────────
    const newUser = this.userRepo.create({
      phone:           dto.phone,
      first_name:      dto.first_name,
      last_name:       dto.last_name,
      ...(dto.email && { email: dto.email }),
      role:            dto.role as unknown as Role,
      status:          UserStatus.PENDING,   // Activation requise
      pin_hash,
      must_change_pin: true,
      // referrer_id stocké dans la colonne nullable
      ...(dto.referrer_id ? { referrer_id: dto.referrer_id } : {}),
    });

    const savedUser = await this.userRepo.save(newUser);

    // ── Envoi instantané du SMS avec le PIN de parrainage ─────────────────────────
    const inviteMessage = `Bienvenue sur EasyArena ! Vous avez été invité(e) par parrainage. Votre code PIN temporaire est : ${tempPin}. Connectez-vous sur https://easyarena221.com/ pour l'activer.`;
    await this.notificationsService.sendRawSms(savedUser.phone, inviteMessage);
    await this.notificationsService.sendSms(
      savedUser.id,
      savedUser.phone,
      inviteMessage,
    );

    // ── 5. Réponse formatée pour Angular ──────────────────────────────────
    // On exclut les champs sensibles de la réponse
    const { pin_hash: _pin, ...safeUser } = savedUser as any;
    void _pin; // évite le warning TS "unused variable"

    return {
      success: true,
      message: `Invitation envoyée à ${dto.first_name} ${dto.last_name}. PIN temporaire : ${tempPin}`,
      data: safeUser,
    };
  }

  // ── Résolution d'identifiants ──────────────────────────────────────────

  async resolveClientId(user: User): Promise<string> {
    const client = await this.clientRepo.findOne({ where: { user: { id: user.id } } });
    if (!client) throw new NotFoundException('Client profile not found');
    return client.id;
  }

  async resolveOwnerId(user: User): Promise<string> {
    if (user.role === Role.FIELD_ADMIN || user.role === Role.CONTROLLER) {
      const staff = await this.staffRepo.findOne({ where: { user: { id: user.id } } });
      if (!staff) throw new NotFoundException('Staff profile not found');
      return staff.owner_id;
    }
    const owner = await this.ownerRepo.findOne({ where: { user: { id: user.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');
    return owner.id;
  }

  async resolveVendorId(user: User): Promise<string> {
    const vendor = await this.vendorRepo.findOne({ where: { user: { id: user.id } } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor.id;
  }

  async createStaff(ownerUser: User, dto: CreateStaffDto): Promise<{ user: User; temp_pin: string }> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUser.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');

    const existing = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Ce numéro de téléphone est déjà utilisé.');

    const tempPin = '0000';
    const pin_hash = await bcrypt.hash(tempPin, 10);

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          phone: dto.phone,
          first_name: dto.first_name,
          last_name: dto.last_name,
          role: dto.role,
          status: UserStatus.ACTIVE,
          pin_hash,
          must_change_pin: true,
        }),
      );
      await manager.save(
        manager.create(Staff, { user, owner }),
      );
      return { user, temp_pin: tempPin };
    });
  }

  async listStaffByOwner(ownerUser: User): Promise<Staff[]> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUser.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');

    return this.staffRepo.find({
      where: { owner_id: owner.id },
      relations: ['user'],
      order: { user: { created_at: 'DESC' } },
    });
  }

  async deleteStaff(ownerUser: User, staffId: string): Promise<void> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUser.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');

    const staff = await this.staffRepo.findOne({
      where: { id: staffId, owner_id: owner.id },
      relations: ['user'],
    });
    if (!staff) throw new NotFoundException('Staff not found');

    await this.userRepo.remove(staff.user);
  }

  async updateStaffCanWithdraw(ownerUser: User, staffId: string, canWithdraw: boolean): Promise<Staff> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUser.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');

    const staff = await this.staffRepo.findOne({
      where: { id: staffId, owner_id: owner.id },
      relations: ['user'],
    });
    if (!staff) throw new NotFoundException('Staff not found');

    staff.can_withdraw = canWithdraw;
    return this.staffRepo.save(staff);
  }
}
