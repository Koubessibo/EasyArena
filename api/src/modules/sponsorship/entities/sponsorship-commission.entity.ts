import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SponsorshipCommissionStatus } from '../../../common/enums';
import { Sponsorship } from './sponsorship.entity';

@Entity('sponsorship_commissions')
export class SponsorshipCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sponsorship_id: string;

  @Column({ type: 'uuid' })
  transaction_source_id: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'uuid', nullable: true })
  booking_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  order_id: string | null;

  @Column({ type: 'enum', enum: SponsorshipCommissionStatus, default: SponsorshipCommissionStatus.PENDING })
  status: SponsorshipCommissionStatus;


  @Column({ type: 'int' })
  net_revenue_base: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Sponsorship, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sponsorship_id' })
  sponsorship: Sponsorship;
}
