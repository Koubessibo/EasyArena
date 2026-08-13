import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SportEvent } from '../../events/entities/sport-event.entity';
import { Client } from '../../users/entities/client.entity';

@Entity('event_tickets')
@Index(['qrCodeToken'], { unique: true })
export class EventTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', nullable: true })
  client_id: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => SportEvent, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'event_id' })
  event: SportEvent;

  @Column({ name: 'event_id', nullable: true })
  event_id: string;

  @Column({ type: 'uuid', unique: true })
  qrCodeToken: string;

  /**
   * TOTP secret généré à l'achat du billet.
   * Stocké en clair (peut être chiffré avec AES en production via un KMS).
   * Permet de générer/valider un token TOTP dynamique à 30s qui change.
   */
  @Column({ nullable: true })
  totp_secret: string;

  @Column({ default: 'VALID' })
  status: string; // 'VALID', 'SCANNED', 'CANCELLED', 'PENDING_PAYMENT'

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
