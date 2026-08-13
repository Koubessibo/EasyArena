import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Article } from '../articles/entities/article.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async createProduct(dto: CreateProductDto, vendorId: string): Promise<Product> {
    let category = dto.category;
    if (!category) {
      const lower = (dto.name || '').toLowerCase();
      if (lower.includes('eau') || lower.includes('bouteille') || lower.includes('boisson')) {
        category = 'beverages';
      } else {
        category = 'equipment';
      }
    }

    const product = this.productRepo.create({
      ...dto,
      category,
      vendor_id: vendorId,
    });
    return this.productRepo.save(product);
  }

  async getVendorProducts(vendorId: string): Promise<any[]> {
    const products = await this.productRepo.find({
      where: { vendor_id: vendorId },
      order: { created_at: 'DESC' },
    });

    const articleRepo = this.dataSource.getRepository(Article);
    const articles = await articleRepo.find({
      where: { vendor_id: vendorId },
      relations: ['photos'],
      order: { created_at: 'DESC' },
    });

    const mappedArticles = articles.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      price: Number(a.price),
      stock_quantity: (a as any).stock_quantity ?? 50,
      category: a.category || 'equipment',
      image_url: a.photos && a.photos.length > 0 ? a.photos[0].url : null,
      created_at: a.created_at,
    }));

    return [...products, ...mappedArticles];
  }

  async getActiveProducts(): Promise<Product[]> {
    return this.productRepo.find({
      relations: ['vendor', 'vendor.user'],
      order: { created_at: 'DESC' },
    });
  }

  async getProductById(id: string): Promise<any> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'vendor.user'],
    });
    if (product) return product;

    const articleRepo = this.dataSource.getRepository(Article);
    const article = await articleRepo.findOne({
      where: { id },
      relations: ['vendor', 'vendor.user', 'photos'],
    });
    if (article) return article;

    throw new NotFoundException('Produit introuvable');
  }

  async updateStock(productId: string, vendorId: string, newQuantity: number): Promise<any> {
    const product = await this.productRepo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });

    if (product) {
      product.stock_quantity = newQuantity;
      return this.productRepo.save(product);
    }

    const articleRepo = this.dataSource.getRepository(Article);
    const article = await articleRepo.findOne({ where: { id: productId, vendor_id: vendorId } as any });
    if (article) {
      (article as any).stock_quantity = newQuantity;
      return articleRepo.save(article);
    }

    throw new NotFoundException('Produit introuvable ou non autorisé');
  }

  async updateProduct(id: string, dto: UpdateProductDto, vendorId: string): Promise<any> {
    // 1. Try products table first — scoped to vendor
    const product = await this.productRepo.findOne({
      where: { id, vendor_id: vendorId },
    });

    if (product) {
      if (!dto.category) {
        const lower = (dto.name || product.name || '').toLowerCase();
        if (lower.includes('eau') || lower.includes('bouteille') || lower.includes('boisson')) {
          dto.category = 'beverages';
        }
      }
      Object.assign(product, dto);
      return this.productRepo.save(product);
    }

    // 2. Try articles table fallback — scoped to vendor
    const articleRepo = this.dataSource.getRepository(Article);
    const article = await articleRepo.findOne({ where: { id, vendor_id: vendorId } as any });
    if (article) {
      if (dto.name !== undefined) article.name = dto.name;
      if (dto.description !== undefined) article.description = dto.description;
      if (dto.price !== undefined) article.price = dto.price;
      if (dto.stock_quantity !== undefined) (article as any).stock_quantity = dto.stock_quantity;
      if (dto.category !== undefined) (article as any).category = dto.category;
      return articleRepo.save(article);
    }

    throw new NotFoundException('Produit introuvable.');
  }

  async deleteProduct(id: string, vendorId: string): Promise<{ success: boolean }> {
    const resProd = await this.productRepo.delete({ id, vendor_id: vendorId });
    if (resProd.affected && resProd.affected > 0) {
      return { success: true };
    }

    const articleRepo = this.dataSource.getRepository(Article);
    const resArt = await articleRepo.delete({ id, vendor_id: vendorId } as any);
    if (resArt.affected && resArt.affected > 0) {
      return { success: true };
    }

    throw new NotFoundException('Produit introuvable.');
  }
}
