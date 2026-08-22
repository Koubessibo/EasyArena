import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Owner } from './owner.entity';

import { Field } from '../../fields/entities/field.entity';

@Entity('staff')
export class Staff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Owner, (owner) => owner.staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'owner_id' })
  owner_id: string;

  @ManyToOne(() => Field, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'field_id' })
  field: Field | null;

  @Column({ name: 'field_id', nullable: true, type: 'uuid' })
  field_id: string | null;

  @Column({ default: false })
  can_withdraw: boolean;
}
