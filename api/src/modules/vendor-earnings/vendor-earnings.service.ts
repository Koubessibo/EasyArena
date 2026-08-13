import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { VendorWithdrawal, VendorWithdrawalStatus } from './entities/vendor-withdrawal.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';

@Injectable()
export class VendorEarningsService {
  private readonly logger = new Logger(VendorEarningsService.name);

  constructor(
    @InjectRepository(VendorWithdrawal)
    private readonly withdrawalRepo: Repository<VendorWithdrawal>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  async getEarningsDashboard(vendorId: string) {
    // 1. Calcul du CA total (Commandes payées ou livrées)
    const orders = await this.orderRepo.find({
      where: {
        vendor_id: vendorId,
        status: In([OrderStatus.PAID, OrderStatus.DELIVERED]),
      },
      order: { created_at: 'DESC' },
    });

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);

    // 2. Calcul des retraits déjà effectués (PENDING + COMPLETED)
    const withdrawals = await this.withdrawalRepo.find({
      where: {
        vendor_id: vendorId,
        status: In([VendorWithdrawalStatus.PENDING, VendorWithdrawalStatus.COMPLETED]),
      }
    });

    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + Number(w.amount), 0);

    // 3. Solde disponible
    const availableBalance = totalRevenue - totalWithdrawn;

    // 4. Les 10 dernières transactions
    const recentTransactions = orders.slice(0, 10);

    return {
      totalRevenue,
      availableBalance,
      recentTransactions,
    };
  }

  async requestWithdrawal(vendorId: string, amount: number): Promise<VendorWithdrawal> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Pessimistic lock: serialize all withdrawals for this vendor
      // Lock ALL existing withdrawal rows for this vendor (SELECT FOR UPDATE)
      await qr.manager
        .createQueryBuilder(VendorWithdrawal, 'w')
        .setLock('pessimistic_write')
        .where('w.vendor_id = :vendorId', { vendorId })
        .andWhere('w.status IN (:...statuses)', {
          statuses: [VendorWithdrawalStatus.PENDING, VendorWithdrawalStatus.COMPLETED],
        })
        .getMany();

      // Compute balance INSIDE the transaction (under lock)
      const revenueResult = await qr.manager
        .createQueryBuilder(Order, 'o')
        .select('COALESCE(SUM(o.total_amount), 0)', 'total')
        .where('o.vendor_id = :vendorId', { vendorId })
        .andWhere('o.status IN (:...statuses)', {
          statuses: [OrderStatus.PAID, OrderStatus.DELIVERED],
        })
        .getRawOne() as { total: string };

      const totalRevenue = Number(revenueResult.total);

      const withdrawnResult = await qr.manager
        .createQueryBuilder(VendorWithdrawal, 'w')
        .select('COALESCE(SUM(w.amount), 0)', 'total')
        .where('w.vendor_id = :vendorId', { vendorId })
        .andWhere('w.status IN (:...statuses)', {
          statuses: [VendorWithdrawalStatus.PENDING, VendorWithdrawalStatus.COMPLETED],
        })
        .getRawOne() as { total: string };

      const totalWithdrawn = Number(withdrawnResult.total);
      const availableBalance = totalRevenue - totalWithdrawn;

      this.logger.log(
        `[Withdrawal] vendor=${vendorId.slice(0, 8)} revenue=${totalRevenue} withdrawn=${totalWithdrawn} available=${availableBalance} requested=${amount}`,
      );

      if (amount > availableBalance) {
        throw new BadRequestException('Solde disponible insuffisant pour ce retrait.');
      }

      // Create withdrawal record INSIDE the transaction
      const withdrawal = qr.manager.create(VendorWithdrawal, {
        vendor_id: vendorId,
        amount,
        status: VendorWithdrawalStatus.PENDING,
      });
      const saved = await qr.manager.save(VendorWithdrawal, withdrawal);

      await qr.commitTransaction();
      this.logger.log(`[Withdrawal] SUCCESS vendor=${vendorId.slice(0, 8)} amount=${amount}`);
      return saved;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
