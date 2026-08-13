import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sport_events')
@Index(['owner_id'])
export class SportEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  owner_id: string;

  @Column()
  name: string;

  @Column({ type: 'date' })
  date: Date;

  @Column()
  time: string;

  @Column()
  location: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int', default: 0 })
  ticket_price: number;

  @Column({ type: 'text', nullable: true })
  cover_image_url: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
