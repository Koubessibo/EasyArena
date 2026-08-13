import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BookingStatus } from '../../../common/enums';
import { Client } from '../../users/entities/client.entity';
import { Field } from '../../fields/entities/field.entity';
import { FieldSchedule } from '../../fields/entities/field-schedule.entity';
import { Payment } from '../../payments/entities/payment.entity';

@Entity('bookings')
@Index(['field_id', 'booking_date'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, (client) => client.bookings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  client_id: string;

  @ManyToOne(() => Field, (field) => field.bookings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'field_id' })
  field: Field;

  @Column({ name: 'field_id' })
  field_id: string;

  @ManyToOne(() => FieldSchedule, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'schedule_id' })
  schedule: FieldSchedule;

  @Column({ name: 'schedule_id' })
  schedule_id: string;

  @Column({ type: 'date' })
  booking_date: string;

  @Column()
  slot_start: string;

  @Column()
  slot_end: string;

  @Column({ type: 'int', default: 1 })
  num_slots: number;

  @Column({ type: 'int', default: 0 })
  total_amount: number;

  @Column({ type: 'int', default: 0 })
  service_fee: number;

  @Column({ type: 'int', nullable: true, default: null })
  min_deposit_amount: number | null;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING_PAYMENT })
  status: BookingStatus;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Payment, (payment) => payment.booking)
  payment: Payment;
}
