import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('enrollment_requests')
export class EnrollmentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  phone: string;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column({ type: 'varchar' })
  role: 'owner' | 'vendor';

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  // owner-specific
  @Column({ nullable: true })
  field_name?: string;

  @Column({ nullable: true })
  mobile_money?: string;

  @Column({ nullable: true })
  bank_account?: string;

  // vendor-specific
  @Column({ nullable: true })
  shop_name?: string;

  @Column({ nullable: true })
  contact_phone?: string;

  @Column({ nullable: true })
  location?: string;

  // review
  @Column({ nullable: true })
  rejection_note?: string;

  @Column({ nullable: true })
  reviewed_at?: Date;

  @CreateDateColumn()
  created_at: Date;
}
