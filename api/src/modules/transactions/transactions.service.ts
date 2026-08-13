import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import {
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
} from '../../common/enums';

export interface CreateTransactionParams {
  owner_id: string;
  type: TransactionType;
  direction: TransactionDirection;
  amount: number;
  balance_before: number;
  source_id: string;
  source_type: TransactionSourceType;
  description?: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async createTransaction(
    params: CreateTransactionParams,
    manager: EntityManager,
  ): Promise<Transaction> {
    const balance_after =
      params.direction === TransactionDirection.CREDIT
        ? Number(params.balance_before) + Number(params.amount)
        : Number(params.balance_before) - Number(params.amount);

    const reference = await this.generateReference(manager);

    const tx = manager.create(Transaction, {
      owner_id: params.owner_id,
      type: params.type,
      direction: params.direction,
      amount: params.amount,
      balance_before: params.balance_before,
      balance_after,
      reference,
      source_id: params.source_id,
      source_type: params.source_type,
      description: params.description,
    });

    return manager.save(Transaction, tx);
  }

  async getOwnerTransactions(
    ownerId: string,
    page = 1,
    perPage = 20,
    startDate?: string,
    endDate?: string,
  ): Promise<{ data: Transaction[]; total: number; page: number; per_page: number }> {
    const qb = this.txRepo.createQueryBuilder('tx')
      .where('tx.owner_id = :ownerId', { ownerId });
    if (startDate) qb.andWhere('tx.created_at >= :startDate', { startDate: new Date(startDate) });
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('tx.created_at <= :endDate', { endDate: end });
    }
    qb.orderBy('tx.created_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, per_page: perPage };
  }

  async computeOwnerBalance(ownerId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(Transaction) : this.txRepo;
    const result = await repo
      .createQueryBuilder('tx')
      .select("SUM(CASE WHEN tx.direction = 'CREDIT' THEN tx.amount ELSE -tx.amount END)", 'balance')
      .where('tx.owner_id = :ownerId', { ownerId })
      .getRawOne();
    return Number(result?.balance ?? 0);
  }

  private async generateReference(manager: EntityManager): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await manager.count(Transaction);
    return `TXN-${today}-${String(count + 1).padStart(4, '0')}`;
  }
}
