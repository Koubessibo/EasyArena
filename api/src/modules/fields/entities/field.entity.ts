import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FieldStatus, SportType } from '../../../common/enums';
import { Owner } from '../../users/entities/owner.entity';
import { FieldSchedule } from './field-schedule.entity';
import { FieldPhoto } from './field-photo.entity';
import { Booking } from '../../bookings/entities/booking.entity';

@Entity('fields')
export class Field {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Owner, (owner) => owner.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'owner_id' })
  owner_id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: SportType })
  sport_type: SportType;

  @Column()
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, default: 0 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, default: 0 })
  longitude: number;

  @Column({ nullable: true })
  contact_phone: string;

  @Column({ nullable: true })
  contact_email: string;

  @Column({ type: 'text', nullable: true })
  google_maps_url: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'synthetic_turf', nullable: true })
  surface_type: string;

  @Column({ type: 'boolean', default: true, nullable: true })
  has_lighting: boolean;

  @Column({ type: 'boolean', default: true, nullable: true })
  has_changing_rooms: boolean;

  @Column({ type: 'boolean', default: true, nullable: true })
  has_parking: boolean;

  @Column({ type: 'boolean', default: false, nullable: true })
  has_cafeteria: boolean;

  @Column({ type: 'boolean', default: false, nullable: true })
  has_wifi: boolean;

  @Column({ type: 'boolean', default: true, nullable: true })
  provides_equipment: boolean;

  @Column({ type: 'int', default: 0, nullable: true })
  capacity: number;

  @Column({ type: 'enum', enum: FieldStatus, default: FieldStatus.AVAILABLE })
  status: FieldStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deleted_at: Date | null;

  @OneToMany(() => FieldSchedule, (schedule) => schedule.field, { cascade: true })
  schedules: FieldSchedule[];

  @OneToMany(() => FieldPhoto, (photo) => photo.field, { cascade: true })
  photos: FieldPhoto[];

  @OneToMany(() => Booking, (booking) => booking.field)
  bookings: Booking[];
}
