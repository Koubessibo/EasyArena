import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserSubscription } from './user-subscription.entity';
import { InstallmentStatus } from '../../../common/enums';

@Entity('payment_installments')
export class PaymentInstallment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** L'abonnement client lié à cette échéance */
  @ManyToOne(() => UserSubscription, (sub) => sub.installments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription: UserSubscription;

  @Column({ type: 'uuid' })
  subscription_id: string;

  /** Montant à payer pour cette échéance */
  @Column({ type: 'int', default: 0 })
  amount: number;

  /** Date limite de paiement */
  @Column({ type: 'timestamp' })
  due_date: Date;

  /** Statut du paiement de l'échéance */
  @Column({ type: 'enum', enum: InstallmentStatus, default: InstallmentStatus.PENDING })
  status: InstallmentStatus;

  /** Date à laquelle le paiement a été effectivement reçu (nullable) */
  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
