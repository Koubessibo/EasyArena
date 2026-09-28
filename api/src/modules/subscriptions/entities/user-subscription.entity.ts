import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../users/entities/client.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { SubscriptionStatus } from '../../../common/enums';
import { PaymentInstallment } from './payment-installment.entity';

@Entity('user_subscriptions')
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Le client qui a souscrit à l'abonnement */
  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'uuid' })
  client_id: string;

  /** La formule d'abonnement choisie */
  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @Column({ type: 'uuid' })
  plan_id: string;

  /** Statut de l'abonnement */
  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  /** Date de début de validité de l'abonnement */
  @Column({ type: 'timestamp' })
  start_date: Date;

  /** Date de fin de validité de l'abonnement */
  @Column({ type: 'timestamp' })
  end_date: Date;

  /**
   * Séances déjà consommées sur ce pass.
   *
   * `SubscriptionPlan.reservations_count` est le quota *du plan*, partagé par
   * tous ses souscripteurs : il ne peut pas servir de compteur individuel.
   * Le quota restant vaut donc `plan.reservations_count - reservations_used`.
   */
  @Column({ type: 'int', default: 0 })
  reservations_used: number;

  /** Les différentes échéances de paiement liées à cet abonnement */
  @OneToMany(() => PaymentInstallment, (installment) => installment.subscription, {
    cascade: true,
  })
  installments: PaymentInstallment[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
