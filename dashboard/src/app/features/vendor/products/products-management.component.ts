import { Component, inject, signal, computed } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { switchMap, forkJoin, of } from 'rxjs';
import { VendorService } from '../../../core/services/vendor.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { Product, ProductPhoto, ProductCategory, ProductStatus } from '../../../core/models/product.model';

@Component({
  selector: 'app-products-management',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, PageHeaderComponent, StatusBadgeComponent, FcfaPipe],
  templateUrl: './products-management.component.html',
  styleUrl: './products-management.component.scss',
})
export class ProductsManagementComponent {
  svc = inject(VendorService);
  products = this.svc.products;
  showForm = signal(false);
  saving = signal(false);
  feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  constructor() {
    this.svc.loadProducts();
  }
  editingProduct = signal<Product | null>(null);
  filterCategory = signal<ProductCategory | 'all'>('all');

  formData = signal({
    name: '',
    description: '',
    category: 'equipment' as ProductCategory,
    price: 0,
    stock: 0,
    status: 'active' as ProductStatus,
  });

  pendingFiles = signal<File[]>([]);
  previews = signal<string[]>([]);

  categories: { value: ProductCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'equipment', label: 'Équipement' },
    { value: 'shoes', label: 'Chaussures' },
    { value: 'apparel', label: 'Vêtements' },
    { value: 'accessories', label: 'Accessoires' },
  ];

  filteredProducts = computed(() => {
    const cat = this.filterCategory();
    return cat === 'all' ? this.products() : this.products().filter(p => p.category === cat);
  });

  openAdd(): void {
    this.editingProduct.set(null);
    this.formData.set({ name: '', description: '', category: 'equipment', price: 0, stock: 0, status: 'active' });
    this.pendingFiles.set([]);
    this.previews.set([]);
    this.showForm.set(true);
  }

  openEdit(product: Product): void {
    this.editingProduct.set(product);
    this.formData.set({ name: product.name, description: product.description ?? '', category: product.category, price: product.price, stock: product.stock, status: product.status });
    this.pendingFiles.set([]);
    this.previews.set([]);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.previews().forEach(url => URL.revokeObjectURL(url));
    this.pendingFiles.set([]);
    this.previews.set([]);
    this.showForm.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const newFiles = Array.from(input.files);
    this.pendingFiles.update(list => [...list, ...newFiles]);
    this.previews.update(list => [...list, ...newFiles.map(f => URL.createObjectURL(f))]);
    input.value = '';
  }

  removePendingFile(index: number): void {
    URL.revokeObjectURL(this.previews()[index]);
    this.pendingFiles.update(list => list.filter((_, i) => i !== index));
    this.previews.update(list => list.filter((_, i) => i !== index));
  }

  deleteExistingPhoto(photo: ProductPhoto): void {
    const product = this.editingProduct();
    if (!product) return;
    this.svc.deleteArticlePhoto(product.id, photo.id).subscribe({
      next: () => {
        const updated = { ...product, photos: (product.photos ?? []).filter(p => p.id !== photo.id) };
        this.editingProduct.set(updated);
        this.products.update(list => list.map(p => p.id === product.id ? updated : p));
      },
      error: (err: Error) => this.svc.error.set(err.message),
    });
  }

  save(): void {
    const f = this.formData();
    const editing = this.editingProduct();
    const files = this.pendingFiles();
    this.saving.set(true);

    const uploadPhotos = (articleId: string, isNew: boolean) => {
      if (!files.length) return of(null);
      return forkJoin(files.map((file, i) => this.svc.uploadArticlePhoto(articleId, file, isNew && i === 0)));
    };

    const source$ = editing
      ? this.svc.updateProduct(editing.id, f).pipe(switchMap(updated => uploadPhotos(updated.id, false)))
      : this.svc.addProduct({ ...f, vendorId: '' }).pipe(switchMap(created => uploadPhotos(created.id, true)));

    source$.subscribe({
      next: () => {
        const isEditing = !!this.editingProduct();
        this.saving.set(false);
        this.closeForm();
        this.svc.loadProducts();
        this.feedback.set({ type: 'success', message: isEditing ? 'Produit mis à jour avec succès.' : 'Produit créé avec succès.' });
        setTimeout(() => this.feedback.set(null), 5000);
      },
      error: (err: Error) => { this.saving.set(false); this.svc.error.set(err.message); },
    });
  }

  deleteProduct(id: string): void {
    if (confirm('Supprimer ce produit ?')) this.svc.deleteProduct(id);
  }

  categoryLabel(cat: string): string {
    return this.categories.find(c => c.value === cat)?.label ?? cat;
  }

  updateFormField(key: string, value: string | number): void {
    this.formData.update(f => ({ ...f, [key]: value }));
  }
}
