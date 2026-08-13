import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import { ArticlePhoto } from './entities/article-photo.entity';
import { Vendor } from '../users/entities/vendor.entity';
import { StorageService } from '../storage/storage.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleQueryDto } from './dto/article-query.dto';
import { ArticleStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article) private readonly articleRepo: Repository<Article>,
    @InjectRepository(ArticlePhoto) private readonly photoRepo: Repository<ArticlePhoto>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly storageService: StorageService,
  ) {}

  async listArticles(query: ArticleQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;

    const where: Record<string, unknown> = {
      status: Not(ArticleStatus.HIDDEN),
    };
    if (query.sport_type) where['sport_type'] = query.sport_type;
    if (query.category) where['category'] = query.category;
    if (query.vendor_id) where['vendor_id'] = query.vendor_id;

    const [data, total] = await this.articleRepo.findAndCount({
      where,
      relations: ['photos', 'vendor', 'vendor.user'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { data, total, page, per_page: perPage };
  }

  async getArticleDetail(id: string) {
    const article = await this.articleRepo.findOne({
      where: { id },
      relations: ['photos', 'vendor', 'vendor.user'],
    });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async getVendorArticles(user: User, page = 1, perPage = 50) {
    const vendor = await this.vendorRepo.findOne({ where: { user: { id: user.id } } });
    if (!vendor) return { data: [], total: 0, page, per_page: perPage };

    const [data, total] = await this.articleRepo.findAndCount({
      where: { vendor_id: vendor.id },
      relations: ['photos'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { data, total, page, per_page: perPage };
  }

  async createArticle(user: User, dto: CreateArticleDto) {
    const vendor = await this.vendorRepo.findOne({ where: { user: { id: user.id } } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    return this.articleRepo.save(
      this.articleRepo.create({
        vendor_id: vendor.id,
        ...dto,
        status: dto.status ?? ArticleStatus.IN_STOCK,
      }),
    );
  }

  async updateArticle(user: User, id: string, dto: UpdateArticleDto) {
    const article = await this.verifyOwnership(user, id);
    Object.assign(article, dto);
    return this.articleRepo.save(article);
  }

  async deleteArticle(user: User, id: string) {
    const article = await this.verifyOwnership(user, id);
    await this.articleRepo.remove(article);
    return { message: 'Article deleted' };
  }

  async uploadPhoto(user: User, articleId: string, file: Express.Multer.File, isCover: boolean) {
    await this.verifyOwnership(user, articleId);
    const path = this.storageService.buildPath('articles', articleId, file.originalname);
    const url = await this.storageService.uploadFile(path, file.buffer, file.mimetype);

    if (isCover) {
      await this.photoRepo.update({ article_id: articleId }, { is_cover: false });
    }

    return this.photoRepo.save(
      this.photoRepo.create({ article_id: articleId, url, is_cover: isCover }),
    );
  }

  async deletePhoto(user: User, articleId: string, photoId: string) {
    await this.verifyOwnership(user, articleId);
    const photo = await this.photoRepo.findOne({ where: { id: photoId, article_id: articleId } });
    if (!photo) throw new NotFoundException('Photo not found');

    const storagePath = this.storageService.extractPathFromUrl(photo.url);
    if (storagePath) await this.storageService.deleteFile(storagePath);

    await this.photoRepo.remove(photo);
    return { message: 'Photo deleted' };
  }

  private async verifyOwnership(user: User, articleId: string): Promise<Article> {
    const vendor = await this.vendorRepo.findOne({ where: { user: { id: user.id } } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    const article = await this.articleRepo.findOne({ where: { id: articleId } });
    if (!article) throw new NotFoundException('Article not found');
    if (article.vendor_id !== vendor.id) throw new ForbiddenException('You do not own this article');
    return article;
  }
}
