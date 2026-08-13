import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Article } from './article.entity';

@Entity('article_photos')
export class ArticlePhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Article, (article) => article.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: Article;

  @Column({ name: 'article_id' })
  article_id: string;

  @Column()
  url: string;

  @Column({ default: false })
  is_cover: boolean;
}
