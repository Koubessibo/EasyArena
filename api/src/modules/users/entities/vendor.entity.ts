import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Article } from '../../articles/entities/article.entity';

@Entity('vendors')
export class Vendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.vendor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  shop_name: string;

  @Column()
  contact_phone: string;

  @Column({ nullable: true })
  location: string;

  @OneToMany(() => Article, (article) => article.vendor)
  articles: Article[];
}
