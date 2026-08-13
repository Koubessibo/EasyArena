import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ArticleCategory, ArticleStatus, SportType } from '../../../common/enums';
import { Vendor } from '../../users/entities/vendor.entity';
import { ArticlePhoto } from './article-photo.entity';

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Vendor, (vendor) => vendor.articles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @Column({ name: 'vendor_id' })
  vendor_id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ArticleCategory })
  category: ArticleCategory;

  @Column({ type: 'enum', enum: SportType })
  sport_type: SportType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'enum', enum: ArticleStatus, default: ArticleStatus.IN_STOCK })
  status: ArticleStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ArticlePhoto, (photo) => photo.article, { cascade: true })
  photos: ArticlePhoto[];
}
