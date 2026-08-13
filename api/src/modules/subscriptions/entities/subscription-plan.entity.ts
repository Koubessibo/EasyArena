import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Owner } from '../../users/entities/owner.entity';

export interface MoratoriumStep {
  percentage: number;
  daysAfter: number;
}

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Le propriétaire qui propose cette formule */
  @ManyToOne(() => Owner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ type: 'uuid' })
  owner_id: string;

  /** Nom de la formule (ex: "Pass Mensuel - 4 Séances") */
  @Column()
  name: string;

  /** Prix total de l'abonnement */
  @Column({ type: 'int', default: 0 })
  price: number;

  /** Nombre de réservations autorisées pour cet abonnement */
  @Column({ type: 'int' })
  reservations_count: number;

  /** Indique si le paiement moratoire est autorisé */
  @Column({ default: false })
  allows_moratorium: boolean;

  /** 
   * Configuration de l'échelonnement (ex: [{ percentage: 50, daysAfter: 0 }, { percentage: 25, daysAfter: 15 }])
   * Nullable si allows_moratorium est false
   */
  @Column({ type: 'jsonb', nullable: true })
  moratorium_config: MoratoriumStep[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
