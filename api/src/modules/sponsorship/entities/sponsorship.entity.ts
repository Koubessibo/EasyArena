import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SponsorType } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('sponsorships')
@Index(['referee_id'], { unique: true })
export class Sponsorship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sponsor_id: string;

  @Column({ type: 'uuid' })
  referee_id: string;

  @Column({ type: 'enum', enum: SponsorType })
  sponsor_type: SponsorType;

  @Column()
  referee_role: string;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sponsor_id' })
  sponsor: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referee_id' })
  referee: User;
}
