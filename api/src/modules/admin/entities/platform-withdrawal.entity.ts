import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PlatformWithdrawalMethod {
  WAVE = 'WAVE',
  ORANGE_MONEY = 'ORANGE_MONEY',
  FREE_MONEY = 'FREE_MONEY',
  SAMIR_MONEY = 'SAMIR_MONEY',
}

export enum PlatformWithdrawalStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

@Entity('platform_withdrawals')
export class PlatformWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'enum', enum: PlatformWithdrawalMethod })
  method: PlatformWithdrawalMethod;

  @Column({ type: 'varchar' })
  account_details: string;

  @Column({ type: 'varchar', nullable: true })
  external_ref: string | null;

  @Column({ type: 'enum', enum: PlatformWithdrawalStatus, default: PlatformWithdrawalStatus.COMPLETED })
  status: PlatformWithdrawalStatus;

  @CreateDateColumn()
  created_at: Date;
}
