import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Field } from './field.entity';

@Entity('field_slot_blocks')
@Unique(['field_id', 'blocked_date', 'slot_start'])
export class FieldSlotBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Field, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Field;

  @Column({ name: 'field_id' })
  field_id: string;

  @Column({ type: 'date' })
  blocked_date: string;

  @Column()
  slot_start: string;
}
