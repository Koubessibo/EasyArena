import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CancellationRequestStatus } from '../../../common/enums';
import { Booking } from './booking.entity';

@Entity('cancellation_requests')
export class CancellationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ name: 'booking_id' })
  booking_id: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({
    type: 'enum',
    enum: CancellationRequestStatus,
    default: CancellationRequestStatus.PENDING,
  })
  status: CancellationRequestStatus;

  @Column({ type: 'text', nullable: true })
  rejection_note: string;

  @CreateDateColumn()
  requested_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date;

  @Column({ type: 'uuid', nullable: true })
  processed_by: string;
}
