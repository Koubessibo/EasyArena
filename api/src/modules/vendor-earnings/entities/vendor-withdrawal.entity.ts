import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum VendorWithdrawalStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

@Entity('vendor_withdrawals')
@Index(['vendor_id'])
export class VendorWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_id' })
  vendor_id: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ type: 'enum', enum: VendorWithdrawalStatus, default: VendorWithdrawalStatus.PENDING })
  status: VendorWithdrawalStatus;

  @CreateDateColumn()
  requested_at: Date;
}
