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
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
} from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

/**
 * Table polyvalente :
 *  - channel = 'in_app'  -> notification applicative (lue par client-app / dashboard)
 *  - channel = 'sms'/'email' -> journal d'envoi (audit), jamais affiché dans l'app
 *
 * Le front doit TOUJOURS filtrer sur channel = 'in_app'.
 */
@Entity('notifications')
@Index('uq_notifications_dedupe_key', ['dedupe_key'], {
  unique: true,
  where: '"dedupe_key" IS NOT NULL',
})
@Index('idx_notifications_user_type', ['user_id', 'type'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  user_id: string;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  /** Typologie métier (icône / filtre / lien / préférences). */
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  /** Titre court, 150 car. max. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  title: string | null;

  /** Conservé pour compatibilité avec le journal SMS/email. */
  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  message: string;

  /** Route Angular à ouvrir au clic (ex: '/owner/bookings'). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  link: string | null;

  /** Contexte structuré : { bookingId, amount, fieldId, ... }. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.INFO,
  })
  priority: NotificationPriority;

  /**
   * Idempotence : empêche un cron / un webhook rejoué d'insérer deux fois
   * la même notification (ex: 'withdrawal:{id}:approved').
   * Index unique partiel côté base.
   */
  @Column({ name: 'dedupe_key', type: 'varchar', length: 191, nullable: true })
  dedupe_key: string | null;

  @Column({ type: 'enum', enum: NotificationStatus })
  status: NotificationStatus;

  @Column({ default: false })
  is_read: boolean;

  /** Date de lecture (null = non lue). Aligné sur le type réel de `sent_at`. */
  @Column({
    name: 'read_at',
    type: 'timestamp without time zone',
    nullable: true,
  })
  read_at: Date | null;

  /** Date de création. Nom historique conservé ('sent_at') pour la compatibilité. */
  @CreateDateColumn()
  sent_at: Date;
}
