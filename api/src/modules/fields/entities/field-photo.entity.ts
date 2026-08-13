import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field } from './field.entity';

@Entity('field_photos')
export class FieldPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Field, (field) => field.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Field;

  @Column({ name: 'field_id' })
  field_id: string;

  @Column()
  url: string;

  @Column({ default: false })
  is_cover: boolean;
}
