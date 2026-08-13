import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Withdrawal } from './entities/withdrawal.entity';
import { Owner } from '../users/entities/owner.entity';
import { Staff } from '../users/entities/staff.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OtpService } from '../../otp/otp.service';
import { StorageService } from '../storage/storage.service';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';
import { ValidateWithdrawalDto, ValidationAction } from './dto/validate-withdrawal.dto';
import {
  Role,
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
  WithdrawalMethod,
  WithdrawalStatus,
} from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';

const WITHDRAWAL_FEE_PERCENT = 0.01; // 1% frais Mobile Money

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
    @InjectRepository(Owner)
    private readonly ownerRepo: Repository<Owner>,
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly otpService: OtpService,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  private async resolveOwner(user: User): Promise<Owner> {
    if (user.role === Role.FIELD_ADMIN || user.role === Role.CONTROLLER) {
      const staff = await this.staffRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['owner'],
      });
      if (!staff?.owner) throw new NotFoundException('Owner profile not found');
      return staff.owner;
    }
    const owner = await this.ownerRepo.findOne({ where: { user: { id: user.id } } });
    if (!owner) throw new NotFoundException('Owner profile not found');
    return owner;
  }

  private async requireCanWithdraw(user: User): Promise<void> {
    if (user.role === Role.CONTROLLER) {
      const staff = await this.staffRepo.findOne({ where: { user: { id: user.id } } });
      if (!staff?.can_withdraw) throw new ForbiddenException('Retrait non autorisé pour ce compte');
    }
  }

  async getOwnerIdForUser(user: User): Promise<string> {
    const owner = await this.resolveOwner(user);
    return owner.id;
  }

  async sendWithdrawalOtp(user: User) {
    await this.requireCanWithdraw(user);
    const result = await this.otpService.sendOtp(user.phone, user.id);
    return { message: 'Code OTP envoyé', expires_in: result.expires_in };
  }

  async uploadRib(user: User, file: Express.Multer.File) {
    await this.requireCanWithdraw(user);
    if (!file) throw new BadRequestException('Fichier RIB requis');

    const owner = await this.resolveOwner(user);

    const path = this.storageService.buildPath('ribs', owner.id, file.originalname);
    const url = await this.storageService.uploadFile(path, file.buffer, file.mimetype);
    return { url };
  }

  async requestWithdrawal(user: User, dto: RequestWithdrawalDto) {
    await this.requireCanWithdraw(user);
    // 1. Verify OTP first
    await this.otpService.verifyOtpOrThrow(user.phone, dto.otp_code);

    const resolvedOwner = await this.resolveOwner(user);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let owner: Owner;
    let withdrawal: Withdrawal;

    try {
      owner = await qr.manager.findOne(Owner, {
        where: { id: resolvedOwner.id },
        relations: ['user'],
      }) as Owner;
      if (!owner) throw new NotFoundException('Owner profile not found');

      // 2. Check balance
      const computed = await this.transactionsService.computeOwnerBalance(owner.id, qr.manager);
      const pendingResult = (await qr.manager
        .createQueryBuilder(Withdrawal, 'w')
        .select('COALESCE(SUM(w.amount + w.fee), 0)', 'total')
        .where('w.owner_id = :ownerId', { ownerId: owner.id })
        .andWhere('w.status = :status', { status: WithdrawalStatus.PENDING_VALIDATION })
        .getRawOne()) as { total: string };
      const available = computed - Number(pendingResult.total ?? 0);

      const fee = Math.round(Number(dto.amount) * WITHDRAWAL_FEE_PERCENT);
      const totalDebit = Number(dto.amount) + fee;

      if (available < totalDebit) {
        throw new BadRequestException('Solde insuffisant (frais de retrait inclus)');
      }

      if (dto.method === WithdrawalMethod.MOBILE_MONEY) {
        // ── MOBILE MONEY: debit first, then cashout ──────────────────────
        const balanceBefore = await this.transactionsService.computeOwnerBalance(owner.id, qr.manager);

        // Create debit transaction (amount + fee)
        await this.transactionsService.createTransaction(
          {
            owner_id: owner.id,
            type: TransactionType.WITHDRAWAL_DEBIT,
            direction: TransactionDirection.DEBIT,
            amount: totalDebit,
            balance_before: balanceBefore,
            source_id: owner.id,
            source_type: TransactionSourceType.WITHDRAWAL,
            description: `Retrait Mobile Money vers ${dto.destination} (frais : ${fee} FCFA)`,
          },
          qr.manager,
        );

        // Create withdrawal record (amount = what is sent, fee = platform fee)
        withdrawal = await qr.manager.save(
          qr.manager.create(Withdrawal, {
            owner_id: owner.id,
            amount: dto.amount,
            fee,
            method: dto.method,
            destination: dto.destination,
            operator: dto.operator ?? null,
            status: WithdrawalStatus.PROCESSED,
            processed_at: new Date(),
          }),
        );

        // COMMIT — balance is now debited, withdrawal is recorded
        await qr.commitTransaction();
      } else {
        // ── BANK TRANSFER: pending admin validation ──────────────────────
        withdrawal = await qr.manager.save(
          qr.manager.create(Withdrawal, {
            owner_id: owner.id,
            amount: dto.amount,
            fee,
            method: dto.method,
            destination: dto.destination,
            operator: null,
            rib_url: dto.rib_url,
            status: WithdrawalStatus.PENDING_VALIDATION,
          }),
        );

        await qr.commitTransaction();

        await this.notificationsService.sendSms(
          user.id,
          user.phone,
          `Votre demande de retrait de ${dto.amount} FCFA par virement bancaire est en attente de validation.`,
        );

        return withdrawal;
      }
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // ── Phase 2: External cashout (AFTER DB committed & qr released) ────
    if (dto.method === WithdrawalMethod.MOBILE_MONEY && dto.operator) {
      try {
        const cashOutResult = await this.paymentProvider.cashOut({
          amount: dto.amount,
          operator: dto.operator,
          phoneNumber: dto.destination,
          reference: owner.id,
        });

        if (!cashOutResult.success) {
          throw new Error(`CashOut échoué: ${cashOutResult.message}`);
        }

        this.logger.log(`CashOut réussi pour ${dto.destination}: ref=${cashOutResult.external_ref}`);

        // SMS success
        await this.notificationsService.sendSms(
          user.id,
          user.phone,
          `Votre retrait de ${dto.amount} FCFA a été effectué vers ${dto.destination}.`,
        );
      } catch (cashOutError: any) {
        // Compensation: re-credit the owner's balance
        this.logger.error(`CashOut échoué, compensation en cours: ${cashOutError.message}`);

        const mgr = this.dataSource.manager;
        const balanceAfterDebit = await this.transactionsService.computeOwnerBalance(owner.id);

        const refundAmount = Number(withdrawal.amount) + Number(withdrawal.fee ?? 0);
        await this.transactionsService.createTransaction(
          {
            owner_id: owner.id,
            type: TransactionType.REFUND_CREDIT,
            direction: TransactionDirection.CREDIT,
            amount: refundAmount,
            balance_before: balanceAfterDebit,
            source_id: withdrawal.id,
            source_type: TransactionSourceType.WITHDRAWAL,
            description: `Remboursement suite à échec cashout vers ${dto.destination}`,
          },
          mgr,
        );

        // Update withdrawal to REJECTED
        await this.withdrawalRepo.update(withdrawal.id, {
          status: WithdrawalStatus.REJECTED,
          rejection_note: `Échec cashout: ${cashOutError.message}`,
        });

        // SMS error
        await this.notificationsService.sendSms(
          user.id,
          user.phone,
          `Votre retrait de ${dto.amount} FCFA a échoué. Le montant a été recrédité sur votre solde.`,
        );

        return this.withdrawalRepo.findOne({ where: { id: withdrawal.id } });
      }
    }

    return withdrawal;
  }

  async validateWithdrawal(admin: User, withdrawalId: string, dto: ValidateWithdrawalDto) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const withdrawal = await qr.manager.findOne(Withdrawal, {
        where: { id: withdrawalId, status: WithdrawalStatus.PENDING_VALIDATION },
      });
      if (!withdrawal) throw new NotFoundException('Withdrawal not found or not pending');

      const owner = await qr.manager.findOne(Owner, {
        where: { id: withdrawal.owner_id },
        relations: ['user'],
      });
      if (!owner) throw new NotFoundException('Owner not found');

      if (dto.action === ValidationAction.APPROVE) {
        const balanceBefore = await this.transactionsService.computeOwnerBalance(owner.id, qr.manager);
        const fee = Number(withdrawal.fee ?? 0);
        const totalDebit = Number(withdrawal.amount) + fee;

        await this.transactionsService.createTransaction(
          {
            owner_id: owner.id,
            type: TransactionType.WITHDRAWAL_DEBIT,
            direction: TransactionDirection.DEBIT,
            amount: totalDebit,
            balance_before: balanceBefore,
            source_id: withdrawal.id,
            source_type: TransactionSourceType.WITHDRAWAL,
            description: `Retrait par virement vers ${withdrawal.destination} (frais : ${fee} FCFA)`,
          },
          qr.manager,
        );

        await qr.manager.update(Withdrawal, withdrawal.id, {
          status: WithdrawalStatus.PROCESSED,
          validated_by: admin.id,
          processed_at: new Date(),
        });
      } else {
        await qr.manager.update(Withdrawal, withdrawal.id, {
          status: WithdrawalStatus.REJECTED,
          validated_by: admin.id,
          rejection_note: dto.rejection_note,
        });
      }

      await qr.commitTransaction();

      const saved = await this.withdrawalRepo.findOne({ where: { id: withdrawalId } });

      // SMS outside transaction — non-critical
      if (dto.action === ValidationAction.APPROVE && owner.user) {
        await this.notificationsService.sendSms(
          owner.user.id,
          owner.user.phone,
          `Votre retrait de ${withdrawal.amount} FCFA par virement bancaire a été approuvé et sera traité sous peu.`,
        );
      } else if (dto.action !== ValidationAction.APPROVE && owner.user) {
        await this.notificationsService.sendSms(
          owner.user.id,
          owner.user.phone,
          `Votre demande de retrait de ${withdrawal.amount} FCFA a été rejetée. Raison : ${dto.rejection_note ?? 'N/A'}.`,
        );
      }

      return saved;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getOwnerBalance(user: User) {
    const owner = await this.resolveOwner(user);

    const recentTx = await this.dataSource.getRepository(Transaction).find({
      where: { owner_id: owner.id },
      order: { created_at: 'DESC' },
      take: 5,
    });

    const computed = await this.transactionsService.computeOwnerBalance(owner.id);
    const pendingResult = await this.withdrawalRepo
      .createQueryBuilder('w')
      .select('COALESCE(SUM(w.amount + w.fee), 0)', 'total')
      .where('w.owner_id = :ownerId', { ownerId: owner.id })
      .andWhere('w.status = :status', { status: WithdrawalStatus.PENDING_VALIDATION })
      .getRawOne() as { total: string };
    const balance_available = computed - Number(pendingResult.total ?? 0);

    return {
      balance_available,
      recent_transactions: recentTx,
    };
  }

  async getOwnerWithdrawals(user: User, page = 1, perPage = 20, startDate?: string, endDate?: string) {
    const owner = await this.resolveOwner(user);

    const qb = this.withdrawalRepo.createQueryBuilder('w')
      .where('w.owner_id = :ownerId', { ownerId: owner.id });
    if (startDate) qb.andWhere('w.requested_at >= :startDate', { startDate: new Date(startDate) });
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('w.requested_at <= :endDate', { endDate: end });
    }
    qb.orderBy('w.requested_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, per_page: perPage };
  }

  async getWithdrawalById(user: User, id: string) {
    const owner = await this.resolveOwner(user);
    const withdrawal = await this.withdrawalRepo.findOne({
      where: { id, owner_id: owner.id },
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    return withdrawal;
  }

  async listAllWithdrawals(page = 1, perPage = 20) {
    const [data, total] = await this.withdrawalRepo.findAndCount({
      order: { requested_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['owner', 'owner.user'],
    });
    return { data, total };
  }
}
