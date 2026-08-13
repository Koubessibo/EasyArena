import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MobileOperator, PaymentMethod, PaymentStatus } from '../../../common/enums';
import { Booking } from '../../bookings/entities/booking.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Booking, (booking) => booking.payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ name: 'booking_id', unique: true })
  booking_id: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'enum', enum: MobileOperator, nullable: true })
  operator: MobileOperator | null;

  @Column({ nullable: true })
  phone_number: string;

  @Column({ nullable: true })
  external_ref: string;

  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date;
}
