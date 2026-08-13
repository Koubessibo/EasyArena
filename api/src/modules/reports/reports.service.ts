import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  /**
   * Récupère l'historique complet des transactions d'un propriétaire
   */
  async getOwnerTransactions(ownerId: string): Promise<Transaction[]> {
    return this.transactionRepo.find({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
    });
  }
}
