import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Field } from '../fields/entities/field.entity';
import { Article } from '../articles/entities/article.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { VendorWithdrawal, VendorWithdrawalStatus } from '../vendor-earnings/entities/vendor-withdrawal.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';
import { UsersService } from '../users/users.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { Role, ArticleStatus, BookingStatus, FieldStatus, TransactionType, UserStatus } from '../../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOwnerDto } from '../users/dto/create-owner.dto';
import { CreateVendorDto } from '../users/dto/create-vendor.dto';
import { UpdateUserStatusDto } from '../users/dto/update-user-status.dto';
import { ValidateWithdrawalDto } from '../withdrawals/dto/validate-withdrawal.dto';

import { PlatformWithdrawal, PlatformWithdrawalStatus } from './entities/platform-withdrawal.entity';
import { CreatePlatformWithdrawalDto } from './dto/create-platform-withdrawal.dto';

type StatPeriod = 'today' | 'week' | 'month' | 'all_time';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Field) private readonly fieldRepo: Repository<Field>,
    @InjectRepository(Article) private readonly articleRepo: Repository<Article>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(PlatformWithdrawal) private readonly platformWithdrawalRepo: Repository<PlatformWithdrawal>,
    private readonly usersService: UsersService,
    private readonly withdrawalsService: WithdrawalsService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async getStats(period: StatPeriod = 'all_time') {
    const dateFilter = this.buildDateFilter(period);

    const [
      allUsers,
      allBookings,
      totalRevenueTx,
      recentBookings,
      activeFields,
      activeVendors,
    ] = await Promise.all([
      this.userRepo.createQueryBuilder('u')
        .select('u.role', 'role')
        .addSelect('COUNT(*)', 'count')
        .groupBy('u.role')
        .getRawMany(),
      this.bookingRepo.createQueryBuilder('b')
        .select('b.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where(dateFilter.booking ? 'b.created_at >= :from' : '1=1', { from: dateFilter.booking })
        .groupBy('b.status')
        .getRawMany(),
      this.txRepo.createQueryBuilder('t')
        .select('SUM(t.amount)', 'total')
        .where('t.type = :type', { type: TransactionType.BOOKING_CREDIT })
        .andWhere(dateFilter.tx ? 't.created_at >= :from' : '1=1', { from: dateFilter.tx })
        .getRawOne(),
      this.bookingRepo.find({
        order: { created_at: 'DESC' },
        take: 10,
        relations: ['field', 'client', 'client.user'],
      }),
      this.fieldRepo.count({ where: { status: FieldStatus.AVAILABLE } }),
      this.userRepo.count({ where: { role: Role.VENDOR, status: UserStatus.ACTIVE } }),
    ]);

    const serviceFeeTotal = await this.bookingRepo
      .createQueryBuilder('b')
      .select('SUM(b.service_fee)', 'total')
      .where('b.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere(dateFilter.booking ? 'b.created_at >= :from' : '1=1', { from: dateFilter.booking })
      .getRawOne();

    return {
      period,
      total_users: Object.fromEntries(allUsers.map((r) => [r.role, parseInt(r.count)])),
      total_bookings: Object.fromEntries(allBookings.map((r) => [r.status, parseInt(r.count)])),
      total_owner_earnings: parseFloat(totalRevenueTx?.total ?? '0'),
      total_revenue: parseFloat(serviceFeeTotal?.total ?? '0'),
      active_vendors: activeVendors,
      recent_bookings: recentBookings,
    };
  }

  async getGlobalDashboardStats() {
    // 1. Répartition des utilisateurs par rôle
    const usersByRole = await this.userRepo.createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.role')
      .getRawMany();

    const userDistribution = {
      clients: parseInt(usersByRole.find(r => r.role === Role.CLIENT)?.count || '0'),
      owners: parseInt(usersByRole.find(r => r.role === Role.OWNER)?.count || '0'),
      vendors: parseInt(usersByRole.find(r => r.role === Role.VENDOR)?.count || '0'),
      admins: parseInt(usersByRole.find(r => r.role === Role.ADMIN)?.count || '0'),
    };
    
    const totalUsers = Object.values(userDistribution).reduce((a, b) => a + b, 0);

    // 2. Volume total des réservations
    const totalReservations = await this.bookingRepo.count();

    // 3. Revenu Net de la plateforme (somme des frais de service des réservations confirmées)
    const revenueResult = await this.bookingRepo.createQueryBuilder('b')
      .select('SUM(b.service_fee)', 'total')
      .where('b.status = :status', { status: BookingStatus.CONFIRMED })
      .getRawOne();
    
    const platformRevenue = parseFloat(revenueResult?.total ?? '0');

    // 4. Retraits en attente
    const pendingOwnerWithdrawals = await this.dataSource.getRepository(Withdrawal).count({
      where: { status: 'PENDING_VALIDATION' as any }
    });
    const pendingVendorWithdrawals = await this.dataSource.getRepository(VendorWithdrawal).count({
      where: { status: VendorWithdrawalStatus.PENDING }
    });
    const pendingWithdrawals = pendingOwnerWithdrawals + pendingVendorWithdrawals;

    // 5. Flux d'activité récent (combinaison des derniers utilisateurs et dernières réservations)
    const latestUsers = await this.userRepo.find({
      order: { created_at: 'DESC' },
      take: 5,
    });
    const latestBookings = await this.bookingRepo.find({
      order: { created_at: 'DESC' },
      take: 5,
      relations: ['field', 'client', 'client.user'],
    });

    const recentActivity = [
      ...latestUsers.map(u => ({
        id: u.id,
        type: 'NEW_USER',
        title: 'Nouvel Utilisateur Inscrit',
        description: `Un nouveau ${u.role.toLowerCase()} s'est inscrit : ${u.first_name} ${u.last_name}`,
        date: u.created_at,
        status: 'INFO',
      })),
      ...latestBookings.map(b => ({
        id: b.id,
        type: 'NEW_BOOKING',
        title: 'Nouvelle Réservation',
        description: `Réservation sur "${b.field.name}" pour ${b.total_amount} CFA`,
        date: b.created_at,
        status: 'SUCCESS',
      }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

    return {
      totalUsers,
      userDistribution,
      totalReservations,
      platformRevenue,
      pendingWithdrawals,
      recentActivity,
    };
  }

  listUsers(filters: {
    role?: Role;
    status?: UserStatus;
    search?: string;
    page?: number;
    per_page?: number;
  }) {
    return this.usersService.listUsers(filters);
  }

  createOwner(dto: CreateOwnerDto) {
    return this.usersService.createOwner(dto);
  }

  createVendor(dto: CreateVendorDto) {
    return this.usersService.createVendor(dto);
  }

  updateUserStatus(id: string, dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(id, dto.status);
  }

  deleteUser(id: string) {
    return this.usersService.deleteUser(id);
  }

  listAllBookings(page = 1, perPage = 20) {
    return this.bookingRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['field', 'client', 'client.user', 'payment'],
    }).then(([data, total]) => ({ data, total }));
  }

  listAllWithdrawals(page = 1, perPage = 20) {
    return this.withdrawalsService.listAllWithdrawals(page, perPage);
  }

  validateWithdrawal(admin: User, id: string, dto: ValidateWithdrawalDto) {
    return this.withdrawalsService.validateWithdrawal(admin, id, dto);
  }

  async getMonthlyRevenue(): Promise<{ month: string; value: number }[]> {
    const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

    // Build skeleton for the last 7 months (oldest → newest)
    const now = new Date();
    const skeleton: { year: number; month: number; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      skeleton.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS_FR[d.getMonth()], value: 0 });
    }

    // Query confirmed bookings grouped by month, summing service_fee
    const rows: { yr: string; mo: string; total: string }[] = await this.bookingRepo
      .createQueryBuilder('b')
      .select("EXTRACT(YEAR FROM b.created_at)", 'yr')
      .addSelect("EXTRACT(MONTH FROM b.created_at)", 'mo')
      .addSelect('SUM(b.service_fee)', 'total')
      .where('b.status = :status', { status: 'confirmed' })
      .andWhere("b.created_at >= :from", { from: skeleton[0] ? new Date(skeleton[0].year, skeleton[0].month - 1, 1) : new Date(0) })
      .groupBy("EXTRACT(YEAR FROM b.created_at)")
      .addGroupBy("EXTRACT(MONTH FROM b.created_at)")
      .getRawMany();

    // Merge real data into skeleton
    for (const row of rows) {
      const entry = skeleton.find(s => s.year === parseInt(row.yr) && s.month === parseInt(row.mo));
      if (entry) entry.value = parseFloat(row.total ?? '0');
    }

    return skeleton.map(s => ({ month: s.label, value: s.value }));
  }

  async listFields(page = 1, perPage = 20, status?: FieldStatus) {
    const [data, total] = await this.fieldRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['owner', 'owner.user'],
      ...(status ? { where: { status } } : {}),
    });
    return { data, total };
  }

  async updateFieldStatus(id: string, status: FieldStatus, admin?: User) {
    const field = await this.fieldRepo.findOne({
      where: { id },
      relations: ['owner', 'owner.user'],
    });
    if (!field) throw new Error('Field not found');
    field.status = status;
    const saved = await this.fieldRepo.save(field);
    if (field.owner?.user) {
      await this.notificationsService.sendSms(
        field.owner.user.id,
        field.owner.user.phone,
        `Le statut de votre terrain "${field.name}" a été mis à jour : ${status}.`,
      );
    }
    return saved;
  }

  async listArticles(page = 1, perPage = 20, status?: ArticleStatus) {
    const [data, total] = await this.articleRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['vendor', 'vendor.user'],
      ...(status ? { where: { status } } : {}),
    });
    return { data, total };
  }

  async updateArticleStatus(id: string, status: ArticleStatus, admin?: User) {
    const article = await this.articleRepo.findOne({
      where: { id },
      relations: ['vendor', 'vendor.user'],
    });
    if (!article) throw new Error('Article not found');
    article.status = status;
    const saved = await this.articleRepo.save(article);
    if (article.vendor?.user) {
      await this.notificationsService.sendSms(
        article.vendor.user.id,
        article.vendor.user.phone,
        `Le statut de votre article "${article.name}" a été mis à jour : ${status}.`,
      );
    }
    return saved;
  }

  private buildDateFilter(period: StatPeriod): { booking?: Date; tx?: Date } {
    const now = new Date();
    if (period === 'today') {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { booking: from, tx: from };
    }
    if (period === 'week') {
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { booking: from, tx: from };
    }
    if (period === 'month') {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { booking: from, tx: from };
    }
    return {};
  }

  /**
   * Super Admin : Solde de trésorerie disponible (revenus nets de la plateforme).
   */
  async getPlatformTreasuryBalance() {
    // 1. Total des revenus bruts de la plateforme (frais de service des réservations confirmées)
    const grossRevResult = await this.bookingRepo
      .createQueryBuilder('b')
      .select('SUM(b.service_fee)', 'total')
      .where('b.status = :status', { status: BookingStatus.CONFIRMED })
      .getRawOne();
    const totalGrossRevenue = parseFloat(grossRevResult?.total ?? '0');

    // 2. Total des retraits déjà effectués par la plateforme
    const withdrawnResult = await this.platformWithdrawalRepo
      .createQueryBuilder('pw')
      .select('SUM(pw.amount)', 'total')
      .where('pw.status = :status', { status: PlatformWithdrawalStatus.COMPLETED })
      .getRawOne();
    const totalWithdrawn = parseFloat(withdrawnResult?.total ?? '0');

    const treasuryBalance = Math.max(0, totalGrossRevenue - totalWithdrawn);

    return {
      success: true,
      total_gross_revenue: totalGrossRevenue,
      total_withdrawn: totalWithdrawn,
      treasury_balance: treasuryBalance,
      fee_rate: '0%',
      currency: 'FCFA',
    };
  }

  /**
   * Super Admin : Effectuer un retrait sans frais (0% de frais) depuis la trésorerie.
   */
  async withdrawPlatformTreasury(dto: CreatePlatformWithdrawalDto) {
    return this.dataSource.transaction(async (manager) => {
      const grossRevResult = await manager
        .createQueryBuilder(Booking, 'b')
        .select('SUM(b.service_fee)', 'total')
        .where('b.status = :status', { status: BookingStatus.CONFIRMED })
        .getRawOne();
      const totalGrossRevenue = parseFloat(grossRevResult?.total ?? '0');

      const withdrawnResult = await manager
        .createQueryBuilder(PlatformWithdrawal, 'pw')
        .select('SUM(pw.amount)', 'total')
        .where('pw.status = :status', { status: PlatformWithdrawalStatus.COMPLETED })
        .getRawOne();
      const totalWithdrawn = parseFloat(withdrawnResult?.total ?? '0');

      const currentBalance = Math.max(0, totalGrossRevenue - totalWithdrawn);

      if (dto.amount > currentBalance) {
        throw new Error(
          `Solde de trésorerie insuffisant. Solde disponible : ${currentBalance} FCFA, Montant demandé : ${dto.amount} FCFA`,
        );
      }

      // Règle métier stricte : 0% de frais. Le montant déduit est strictement égal au montant demandé.
      const platformWithdrawal = manager.create(PlatformWithdrawal, {
        amount: dto.amount,
        method: dto.method,
        account_details: dto.accountDetails,
        status: PlatformWithdrawalStatus.COMPLETED,
      });

      const savedWithdrawal = await manager.save(platformWithdrawal);
      const newBalance = currentBalance - dto.amount;

      return {
        success: true,
        message: `Décaissement de ${dto.amount} FCFA effectué avec succès sans aucun frais (0%).`,
        withdrawal: savedWithdrawal,
        new_treasury_balance: newBalance,
      };
    });
  }

  /**
   * Super Admin : Historique des retraits de trésorerie de la plateforme.
   */
  async getPlatformWithdrawalHistory() {
    const withdrawals = await this.platformWithdrawalRepo.find({
      order: { created_at: 'DESC' },
    });

    return {
      success: true,
      withdrawals,
    };
  }
}
