import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MobileOperator, WithdrawalMethod, WithdrawalStatus } from '../../../common/enums';
import { Owner } from '../../users/entities/owner.entity';

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Owner, (owner) => owner.withdrawals, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'owner_id' })
  owner_id: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ type: 'int', default: 0 })
  fee: number;

  @Column({ type: 'enum', enum: WithdrawalMethod })
  method: WithdrawalMethod;

  @Column()
  destination: string;

  @Column({ type: 'varchar', nullable: true })
  operator: MobileOperator | null;

  @Column({ type: 'text', nullable: true })
  rib_url: string;

  @Column({ type: 'enum', enum: WithdrawalStatus, default: WithdrawalStatus.PENDING_VALIDATION })
  status: WithdrawalStatus;

  @Column({ type: 'uuid', nullable: true })
  validated_by: string;

  @Column({ type: 'text', nullable: true })
  rejection_note: string;

  @CreateDateColumn()
  requested_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date;
}
