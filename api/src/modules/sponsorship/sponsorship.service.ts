import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, MoreThan, Repository } from 'typeorm';
import { Sponsorship } from './entities/sponsorship.entity';
import { SponsorshipCommission } from './entities/sponsorship-commission.entity';
import {
  SponsorshipWithdrawal,
  SponsorshipWithdrawalStatus,
} from './entities/sponsorship-withdrawal.entity';
import { User } from '../users/entities/user.entity';
import {
  SponsorType,
  SponsorshipCommissionStatus,
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
  UserStatus,
} from '../../common/enums';
import {
  computeNetRevenue,
  computeSponsorshipCommissions,
  getSponsorshipGrid,
  GATEWAY_INGRESS_PERCENT,
  GATEWAY_EGRESS_PERCENT,
  SPONSORSHIP_GRIDS,
} from '../../common/utils/finance.utils';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OtpService } from '../../otp/otp.service';
import { WithdrawSponsorshipDto } from './dto/withdraw-sponsorship.dto';

@Injectable()
export class SponsorshipService {
  private readonly logger = new Logger(SponsorshipService.name);

  constructor(
    @InjectRepository(Sponsorship)
    private readonly sponsorshipRepo: Repository<Sponsorship>,
    @InjectRepository(SponsorshipCommission)
    private readonly commissionRepo: Repository<SponsorshipCommission>,
    @InjectRepository(SponsorshipWithdrawal)
    private readonly withdrawalRepo: Repository<SponsorshipWithdrawal>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Creates a sponsorship link between sponsor and referee.
   */
  async createSponsorship(
    sponsorId: string,
    refereeId: string,
    refereeRole: string,
  ): Promise<Sponsorship> {
    const sponsor = await this.userRepo.findOne({ where: { id: sponsorId } });
    if (!sponsor) throw new Error('Sponsor not found');

    const sponsorIsAmbassador = sponsor.is_ambassador;
    const sponsorType = sponsorIsAmbassador ? SponsorType.AMBASSADOR : SponsorType.CLIENT;

    const grid = getSponsorshipGrid(sponsorIsAmbassador, refereeRole);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + grid.duration_months);

    const sponsorship = this.sponsorshipRepo.create({
      sponsor_id: sponsorId,
      referee_id: refereeId,
      sponsor_type: sponsorType,
      referee_role: refereeRole,
      expires_at: expiresAt,
    });

    return this.sponsorshipRepo.save(sponsorship);
  }

  /**
   * Creates a sponsorship link within an existing transaction (atomic with registration).
   */
  async createSponsorshipWithManager(
    sponsorId: string,
    refereeId: string,
    refereeRole: string,
    manager: EntityManager,
  ): Promise<Sponsorship> {
    const sponsor = await manager.findOne(User, { where: { id: sponsorId } });
    if (!sponsor) throw new Error('Sponsor not found');

    const sponsorIsAmbassador = sponsor.is_ambassador;
    const sponsorType = sponsorIsAmbassador ? SponsorType.AMBASSADOR : SponsorType.CLIENT;

    const grid = getSponsorshipGrid(sponsorIsAmbassador, refereeRole);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + grid.duration_months);

    const sponsorship = manager.create(Sponsorship, {
      sponsor_id: sponsorId,
      referee_id: refereeId,
      sponsor_type: sponsorType,
      referee_role: refereeRole,
      expires_at: expiresAt,
    });

    return manager.save(Sponsorship, sponsorship);
  }

  /**
   * Core MLM engine: distributes commissions when a payment is confirmed.
   * MUST be called ONLY on Booking/Order payments, NEVER on Withdrawals.
   *
   * @param buyerUserId - The user who made the payment
   * @param principalAmount - The base amount (before fees)
   * @param sourceId - Payment/Order ID for traceability
   * @param manager - Transaction EntityManager for atomicity
   */
  async distributeCommissions(
    buyerUserId: string,
    principalAmount: number,
    sourceId: string,
    manager: EntityManager,
  ): Promise<void> {
    const now = new Date();

    // N1: Find direct sponsor of the buyer
    const n1Sponsorship = await manager.findOne(Sponsorship, {
      where: {
        referee_id: buyerUserId,
        expires_at: MoreThan(now),
      },
      relations: ['sponsor'],
    });

    if (!n1Sponsorship) {
      this.logger.debug(`[Sponsorship] No active N1 sponsor for user ${buyerUserId}`);
      return;
    }

    const { netRevenue } = computeNetRevenue(principalAmount);
    if (netRevenue <= 0) {
      this.logger.warn(`[Sponsorship] NetRevenue is 0 or negative for principal ${principalAmount}`);
      return;
    }

    const n1Sponsor = n1Sponsorship.sponsor;
    const n1Grid = getSponsorshipGrid(n1Sponsor.is_ambassador, n1Sponsorship.referee_role);
    const { n1_commission } = computeSponsorshipCommissions(netRevenue, n1Grid);

    // Credit N1 sponsor
    if (n1_commission > 0) {
      await this.creditSponsor(n1Sponsor.id, n1_commission, sourceId, 1, n1Sponsorship.id, netRevenue, manager);
      this.logger.log(`[Sponsorship] N1 commission ${n1_commission} FCFA → ${n1Sponsor.phone}`);

      // Async SMS notification for N1 sponsor (non-blocking)
      this.notificationsService
        .sendSms(
          n1Sponsor.id,
          n1Sponsor.phone,
          `Félicitations ! Vous venez de recevoir +${n1_commission} FCFA de commission grâce à votre filleul sur EasyArena.`,
        )
        .catch((err) =>
          this.logger.warn(`[Sponsorship] Failed to send N1 commission SMS: ${err.message}`),
        );
    }

    // N2: Find sponsor of the N1 sponsor
    const n2Sponsorship = await manager.findOne(Sponsorship, {
      where: {
        referee_id: n1Sponsor.id,
        expires_at: MoreThan(now),
      },
      relations: ['sponsor'],
    });

    if (!n2Sponsorship) {
      this.logger.debug(`[Sponsorship] No active N2 sponsor for user ${n1Sponsor.id}`);
      return;
    }

    const n2Sponsor = n2Sponsorship.sponsor;
    const n2Grid = getSponsorshipGrid(n2Sponsor.is_ambassador, n2Sponsorship.referee_role);
    const { n2_commission } = computeSponsorshipCommissions(netRevenue, n2Grid);

    // Credit N2 sponsor
    if (n2_commission > 0) {
      await this.creditSponsor(n2Sponsor.id, n2_commission, sourceId, 2, n2Sponsorship.id, netRevenue, manager);
      this.logger.log(`[Sponsorship] N2 commission ${n2_commission} FCFA → ${n2Sponsor.phone}`);

      // Async SMS notification for N2 sponsor (non-blocking)
      this.notificationsService
        .sendSms(
          n2Sponsor.id,
          n2Sponsor.phone,
          `Félicitations ! Vous venez de recevoir +${n2_commission} FCFA de commission grâce à votre filleul sur EasyArena.`,
        )
        .catch((err) =>
          this.logger.warn(`[Sponsorship] Failed to send N2 commission SMS: ${err.message}`),
        );
    }
  }

  private async creditSponsor(
    sponsorUserId: string,
    amount: number,
    sourceId: string,
    level: number,
    sponsorshipId: string,
    netRevenueBase: number,
    manager: EntityManager,
  ): Promise<void> {
    const { Owner } = await import('../users/entities/owner.entity');
    const ownerProfile = await manager.findOne(Owner, {
      where: { user: { id: sponsorUserId } },
    });

    if (ownerProfile) {
      // Owner/Vendor: credit ONLY via transaction ledger (withdrawable balance)
      const balanceBefore = await this.transactionsService.computeOwnerBalance(ownerProfile.id, manager);
      await this.transactionsService.createTransaction(
        {
          owner_id: ownerProfile.id,
          type: TransactionType.BOOKING_CREDIT,
          direction: TransactionDirection.CREDIT,
          amount,
          balance_before: balanceBefore,
          source_id: sourceId,
          source_type: TransactionSourceType.PAYMENT,
          description: `Commission parrainage N${level}`,
        },
        manager,
      );
    } else {
      // Client: credit ONLY wallet_balance (no ledger)
      await manager.increment(User, { id: sponsorUserId }, 'wallet_balance', amount);
    }

    // Record the commission
    const commission = manager.create(SponsorshipCommission, {
      sponsorship_id: sponsorshipId,
      transaction_source_id: sourceId,
      amount,
      level,
      status: SponsorshipCommissionStatus.CREDITED,
      net_revenue_base: netRevenueBase,
    });
    await manager.save(SponsorshipCommission, commission);
  }

  /**
   * Envoi du code OTP pour sécuriser la demande de retrait Mobile Money.
   */
  async sendWithdrawalOtp(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('Compte suspendu');
    }
    if (user.wallet_balance <= 0) {
      throw new BadRequestException('Solde insuffisant pour effectuer un retrait');
    }

    return this.otpService.sendOtp(user.phone, user.id);
  }

  /**
   * Workflow de retrait automatisé pour Client / Ambassadeur depuis wallet_balance.
   * Blindé contre le Double-Spending (SQL atomique) et sécurisé par OTP.
   */
  async requestWithdrawal(userId: string, dto: WithdrawSponsorshipDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('Compte suspendu');
    }
    if (dto.amount <= 0) {
      throw new BadRequestException('Le montant du retrait doit être supérieur à 0');
    }

    // 1. Validation STRICTE de l'OTP
    await this.otpService.verifyOtpOrThrow(user.phone, dto.otp_code);

    // 2. Déduction ATOMIQUE par requête SQL stricte (Anti-Double-Spending / Anti-Negative Balance)
    const updateResult = await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ wallet_balance: () => `wallet_balance - ${dto.amount}` })
      .where('id = :id AND wallet_balance >= :amount', { id: userId, amount: dto.amount })
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      throw new BadRequestException('Fonds insuffisants ou requête concurrente détectée');
    }

    // 3. Enregistrement de la demande
    const withdrawal = this.withdrawalRepo.create({
      user_id: userId,
      amount: dto.amount,
      phone: dto.phone,
      operator: dto.operator,
      status: SponsorshipWithdrawalStatus.PENDING,
    });
    await this.withdrawalRepo.save(withdrawal);

    // 4. Notification SMS asynchrone (non-bloquante)
    this.notificationsService
      .sendSms(
        user.id,
        user.phone,
        `Votre demande de retrait de ${dto.amount} FCFA vers le ${dto.phone} (${dto.operator}) a été enregistrée avec succès sur EasyArena.`,
      )
      .catch((err) =>
        this.logger.warn(`[Sponsorship] Withdrawal SMS notification failed: ${err.message}`),
      );

    const updatedUser = await this.userRepo.findOne({ where: { id: userId } });

    return {
      success: true,
      message: 'Demande de retrait enregistrée avec succès',
      amount: dto.amount,
      new_balance: updatedUser?.wallet_balance ?? 0,
      withdrawal,
    };
  }

  /**
   * Super Admin : Liste les demandes de retraits ambassadeurs en attente.
   */
  async listPendingWithdrawals() {
    return this.withdrawalRepo.find({
      where: { status: SponsorshipWithdrawalStatus.PENDING },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Super Admin : Validation ou Rejet avec restitution automatique du solde.
   */
  async validateWithdrawal(
    adminId: string,
    withdrawalId: string,
    action: 'APPROVE' | 'REJECT',
    rejectionNote?: string,
  ) {
    const withdrawal = await this.withdrawalRepo.findOne({
      where: { id: withdrawalId },
      relations: ['user'],
    });
    if (!withdrawal) throw new NotFoundException('Demande de retrait introuvable');
    if (withdrawal.status !== SponsorshipWithdrawalStatus.PENDING) {
      throw new BadRequestException(`Cette demande est déjà traitée (${withdrawal.status})`);
    }

    if (action === 'APPROVE') {
      withdrawal.status = SponsorshipWithdrawalStatus.PROCESSED;
      withdrawal.processed_at = new Date();
      await this.withdrawalRepo.save(withdrawal);

      if (withdrawal.user) {
        this.notificationsService
          .sendSms(
            withdrawal.user.id,
            withdrawal.user.phone,
            `Votre retrait de ${withdrawal.amount} FCFA vers le ${withdrawal.phone} (${withdrawal.operator}) a été validé et envoyé avec succès.`,
          )
          .catch((err) => this.logger.warn(`Failed to send approval SMS: ${err.message}`));
      }

      return {
        success: true,
        message: 'Demande de retrait approuvée avec succès',
        withdrawal,
      };
    } else {
      withdrawal.status = SponsorshipWithdrawalStatus.REJECTED;
      withdrawal.rejection_note = rejectionNote ?? 'Rejeté par administrateur';
      withdrawal.processed_at = new Date();
      await this.withdrawalRepo.save(withdrawal);

      // RESTITUTION ATOMIQUE DU SOLDE SUR WALLET_BALANCE
      await this.userRepo.increment({ id: withdrawal.user_id }, 'wallet_balance', withdrawal.amount);

      if (withdrawal.user) {
        this.notificationsService
          .sendSms(
            withdrawal.user.id,
            withdrawal.user.phone,
            `Votre demande de retrait de ${withdrawal.amount} FCFA a été rejetée (${withdrawal.rejection_note}). Le montant a été intégralement recrédité sur votre solde EasyArena.`,
          )
          .catch((err) => this.logger.warn(`Failed to send rejection SMS: ${err.message}`));
      }

      return {
        success: true,
        message: 'Demande de retrait rejetée et solde recrédité',
        withdrawal,
      };
    }
  }

  /**
   * Promote or demote a user's ambassador status.
   */
  async setAmbassadorStatus(userId: string, isAmbassador: boolean): Promise<void> {
    await this.userRepo.update(userId, { is_ambassador: isAmbassador });

    // Update existing sponsorships from this user
    const newType = isAmbassador ? SponsorType.AMBASSADOR : SponsorType.CLIENT;
    await this.sponsorshipRepo.update(
      { sponsor_id: userId },
      { sponsor_type: newType },
    );
  }

  async getSponsorshipStats(userId: string) {
    const sponsorships = await this.sponsorshipRepo.find({
      where: { sponsor_id: userId },
      relations: ['referee'],
    });

    const totalCommissions = await this.commissionRepo
      .createQueryBuilder('sc')
      .innerJoin('sc.sponsorship', 's')
      .where('s.sponsor_id = :userId', { userId })
      .select('SUM(sc.amount)', 'total')
      .getRawOne();

    return {
      referrals_count: sponsorships.length,
      total_earned: Number(totalCommissions?.total ?? 0),
      sponsorships,
    };
  }

  async getMyStats(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Backfill referral_code for legacy users who don't have one
    if (!user.referral_code) {
      const code = await this.backfillReferralCode(user);
      user.referral_code = code;
    }

    const n1Referrals = await this.sponsorshipRepo.find({
      where: { sponsor_id: userId },
      relations: ['referee'],
      order: { created_at: 'DESC' },
    });

    const n1Ids = n1Referrals.map(s => s.referee_id);
    let n2Referrals: Sponsorship[] = [];
    if (n1Ids.length > 0) {
      n2Referrals = await this.sponsorshipRepo.find({
        where: { sponsor_id: In(n1Ids) },
        relations: ['referee'],
        order: { created_at: 'DESC' },
      });
    }

    const totalEarned = await this.commissionRepo
      .createQueryBuilder('sc')
      .innerJoin('sc.sponsorship', 's')
      .where('s.sponsor_id = :userId', { userId })
      .select('SUM(sc.amount)', 'total')
      .getRawOne();

    const recentCommissions = await this.commissionRepo
      .createQueryBuilder('sc')
      .innerJoin('sc.sponsorship', 's')
      .where('s.sponsor_id = :userId', { userId })
      .orderBy('sc.created_at', 'DESC')
      .limit(10)
      .getMany();

    const combinedReferrals = [
      ...n1Referrals.map(s => ({
        id: s.id,
        level: 1,
        referee_name: this.maskName(s.referee),
        referee_role: s.referee_role === 'owner' ? 'Propriétaire' : s.referee_role === 'vendor' ? 'Vendeur' : 'Membre',
        created_at: s.created_at,
        expires_at: s.expires_at,
      })),
      ...n2Referrals.map(s => ({
        id: s.id,
        level: 2,
        referee_name: this.maskName(s.referee),
        referee_role: s.referee_role === 'owner' ? 'Propriétaire' : s.referee_role === 'vendor' ? 'Vendeur' : 'Membre',
        created_at: s.created_at,
        expires_at: s.expires_at,
      })),
    ];

    return {
      is_ambassador: user.is_ambassador,
      referral_code: user.referral_code,
      wallet_balance: user.wallet_balance,
      n1_count: n1Referrals.length,
      n2_count: n2Referrals.length,
      total_earned: Number(totalEarned?.total ?? 0),
      recent_commissions: recentCommissions,
      referrals: combinedReferrals,
    };
  }

  private async backfillReferralCode(user: User): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const firstName = (user as any).first_name || 'EA';
    const prefix = firstName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');

    for (let attempt = 0; attempt < 5; attempt++) {
      let suffix = '';
      for (let i = 0; i < 4; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `${prefix}-${suffix}`;
      const exists = await this.userRepo.findOne({ where: { referral_code: code } });
      if (!exists) {
        await this.userRepo.update(user.id, { referral_code: code });
        return code;
      }
    }
    const fallback = `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    await this.userRepo.update(user.id, { referral_code: fallback });
    return fallback;
  }

  private maskName(referee: User | null): string {
    if (!referee) return 'Inconnu';
    const first = (referee as any).first_name ?? '';
    const last = (referee as any).last_name ?? '';
    const maskedFirst = first.charAt(0) ? first.charAt(0) + '***' : '';
    const maskedLast = last.charAt(0) ? last.charAt(0) + '***' : '';
    return `${maskedFirst} ${maskedLast}`.trim() || 'Membre';
  }

  async getPlatformTotals() {
    const totalCommissions = await this.commissionRepo
      .createQueryBuilder('sc')
      .select('SUM(sc.amount)', 'total')
      .getRawOne();

    const totalNetRevenue = await this.commissionRepo
      .createQueryBuilder('sc')
      .select('SUM(sc.net_revenue_base)', 'total')
      .getRawOne();

    const commissionsPaid = Number(totalCommissions?.total ?? 0);
    const netRevenueBase = Number(totalNetRevenue?.total ?? 0);

    return {
      total_commissions_paid: commissionsPaid,
      total_net_revenue_base: netRevenueBase,
      gateway_fees_ratio: GATEWAY_INGRESS_PERCENT + GATEWAY_EGRESS_PERCENT,
    };
  }
}
