import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SponsorshipWithdrawalStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
}

@Entity('sponsorship_withdrawals')
@Index(['user_id'])
export class SponsorshipWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  user_id: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column()
  phone: string;

  @Column()
  operator: string;

  @Column({
    type: 'enum',
    enum: SponsorshipWithdrawalStatus,
    default: SponsorshipWithdrawalStatus.PENDING,
  })
  status: SponsorshipWithdrawalStatus;

  @Column({ type: 'text', nullable: true })
  rejection_note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date | null;
}
