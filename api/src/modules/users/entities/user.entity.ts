import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role, UserStatus } from '../../../common/enums';
import { Client } from './client.entity';
import { Owner } from './owner.entity';
import { Vendor } from './vendor.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  phone: string;

  @Exclude()
  @Column({ nullable: true, select: false })
  pin_hash: string;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  profile_photo: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ default: false })
  must_change_pin: boolean;

  @Column({ default: true })
  is_ambassador: boolean;

  @Column({ type: 'float', nullable: true })
  custom_n1_rate: number | null;

  @Column({ type: 'float', nullable: true })
  custom_n2_rate: number | null;

  @Column({ type: 'int', nullable: true })
  custom_duration_months: number | null;

  @Index({ unique: true })
  @Column({ nullable: true, length: 10 })
  referral_code: string;

  @Column({ type: 'int', default: 0 })
  wallet_balance: number;

  @Column({ nullable: true, type: 'uuid', name: 'referrer_id' })
  referrer_id: string | null;

  @Column({ default: 0 })
  login_attempts: number;

  @Column({ nullable: true, type: 'timestamp' })
  last_failed_login: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Client, (client) => client.user)
  client: Client;

  @OneToOne(() => Owner, (owner) => owner.user)
  owner: Owner;

  @OneToOne(() => Vendor, (vendor) => vendor.user)
  vendor: Vendor;
}
