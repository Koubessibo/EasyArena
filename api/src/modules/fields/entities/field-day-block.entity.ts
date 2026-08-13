import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Field } from './field.entity';

@Entity('field_day_blocks')
@Unique(['field_id', 'blocked_date'])
export class FieldDayBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Field, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Field;

  @Column({ name: 'field_id' })
  field_id: string;

  @Column({ type: 'date' })
  blocked_date: string;

  @Column({ type: 'text', nullable: true, default: null })
  note: string | null;
}
