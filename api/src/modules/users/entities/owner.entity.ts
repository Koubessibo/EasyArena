import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Staff } from './staff.entity';
import { Field } from '../../fields/entities/field.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Withdrawal } from '../../withdrawals/entities/withdrawal.entity';

@Entity('owners')
export class Owner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.owner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  bank_account: string;

  @Column({ nullable: true })
  mobile_money: string;

  @OneToMany(() => Field, (field) => field.owner)
  fields: Field[];

  @OneToMany(() => Transaction, (transaction) => transaction.owner)
  transactions: Transaction[];

  @OneToMany(() => Withdrawal, (withdrawal) => withdrawal.owner)
  withdrawals: Withdrawal[];

  @OneToMany(() => Staff, (staff) => staff.owner)
  staff: Staff[];
}
