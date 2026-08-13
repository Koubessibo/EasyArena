import { Injectable, signal, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Product, ProductPhoto, ProductCategory, ProductStatus, Order } from '../models/product.model';
import { Transaction } from '../models/transaction.model';
import { ApiService } from './api.service';

const CATEGORY_MAP: Record<string, ProductCategory> = {
  equipment: 'equipment',
  footwear: 'shoes',
  clothing: 'apparel',
  other: 'accessories',
};

const CATEGORY_REVERSE: Record<ProductCategory, string> = {
  equipment: 'equipment',
  shoes: 'footwear',
  apparel: 'clothing',
  accessories: 'other',
};

const STATUS_MAP: Record<string, ProductStatus> = {
  in_stock: 'active',
  out_of_stock: 'out_of_stock',
  hidden: 'inactive',
};

const STATUS_REVERSE: Record<ProductStatus, string> = {
  active: 'in_stock',
  out_of_stock: 'out_of_stock',
  inactive: 'hidden',
};

function mapProduct(a: any): Product {
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    category: CATEGORY_MAP[a.category] ?? 'accessories',
    price: Number(a.price ?? 0),
    stock: Number(a.stock_quantity ?? 0),
    status: STATUS_MAP[a.status] ?? 'inactive',
    imageUrl: a.photos?.find((p: any) => p.is_cover)?.url ?? '',
    photos: (a.photos ?? []).map((p: any): ProductPhoto => ({ id: p.id, url: p.url, is_cover: p.is_cover })),
    vendorId: a.vendor_id ?? '',
    createdAt: a.created_at ?? '',
  };
}

@Injectable({ providedIn: 'root' })
export class VendorService {
  private api = inject(ApiService);

  readonly products = signal<Product[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly balance = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly monthlyRevenue = signal([
    { month: 'Oct', value: 0 },
    { month: 'Nov', value: 0 },
    { month: 'Déc', value: 0 },
    { month: 'Jan', value: 0 },
    { month: 'Fév', value: 0 },
    { month: 'Mar', value: 0 },
  ]);

  loadProducts(): void {
    this.api.get<any>('/articles/vendor/articles').subscribe({
      next: (res) => this.products.set((res.data ?? []).map(mapProduct)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  addProduct(product: Omit<Product, 'id' | 'createdAt'>): Observable<Product> {
    const dto = {
      name: product.name,
      description: product.description || product.name,
      category: CATEGORY_REVERSE[product.category] ?? 'other',
      sport_type: 'football',
      price: product.price,
      stock_quantity: product.stock ?? 0,
      status: STATUS_REVERSE[product.status] ?? 'in_stock',
    };
    return this.api.post<any>('/articles', dto).pipe(map(a => mapProduct(a)));
  }

  updateProduct(id: string, updates: Partial<Product>): Observable<Product> {
    const dto: Record<string, unknown> = {};
    if (updates.name) dto['name'] = updates.name;
    if (updates.description !== undefined) dto['description'] = updates.description;
    if (updates.category) dto['category'] = CATEGORY_REVERSE[updates.category];
    if (updates.price !== undefined) dto['price'] = updates.price;
    if (updates.stock !== undefined) dto['stock_quantity'] = updates.stock;
    if (updates.status) dto['status'] = STATUS_REVERSE[updates.status];
    return this.api.put<any>(`/articles/${id}`, dto).pipe(map(a => mapProduct(a)));
  }

  uploadArticlePhoto(articleId: string, file: File, isCover: boolean): Observable<any> {
    const fd = new FormData();
    fd.append('photo', file);
    return this.api.postFile<any>(`/articles/${articleId}/photos?is_cover=${isCover}`, fd);
  }

  deleteArticlePhoto(articleId: string, photoId: string): Observable<any> {
    return this.api.delete<any>(`/articles/${articleId}/photos/${photoId}`);
  }

  deleteProduct(id: string): void {
    this.api.delete<any>(`/articles/${id}`).subscribe({
      next: () => this.products.update(list => list.filter(p => p.id !== id)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  requestWithdrawal(_amount: number): void {
    // Vendor withdrawals not supported in API yet — no-op
  }
}
