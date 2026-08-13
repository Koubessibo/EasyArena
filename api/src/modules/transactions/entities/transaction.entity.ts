import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
} from '../../../common/enums';
import { Owner } from '../../users/entities/owner.entity';

@Entity('transactions')
@Index(['owner_id'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Owner, (owner) => owner.transactions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'owner_id' })
  owner_id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionDirection })
  direction: TransactionDirection;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ type: 'int', default: 0 })
  balance_before: number;

  @Column({ type: 'int', default: 0 })
  balance_after: number;

  @Column({ unique: true })
  reference: string;

  @Column({ type: 'uuid' })
  source_id: string;

  @Column({ type: 'enum', enum: TransactionSourceType })
  source_type: TransactionSourceType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  created_at: Date;
}
