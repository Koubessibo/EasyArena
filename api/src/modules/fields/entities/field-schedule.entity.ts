import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field } from './field.entity';

@Entity('field_schedules')
export class FieldSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Field, (field) => field.schedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Field;

  @Column({ name: 'field_id' })
  field_id: string;

  @Column()
  open_at: string;

  @Column()
  close_at: string;

  @Column({ type: 'int', default: 0 })
  price_per_slot: number;

  @Column({ type: 'int' })
  slot_duration_min: number;

  @Column({ type: 'int', nullable: true, default: null })
  deposit_per_slot: number | null;
}
