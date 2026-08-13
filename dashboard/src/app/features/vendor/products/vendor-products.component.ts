import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

export interface Product {
  id: string;
  name: string;
  description: string;
  category?: string;
  price: number;
  stock_quantity: number;
  image_url: string | null;
}

export interface ProductCategoryOption {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-vendor-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './vendor-products.component.html',
  styleUrls: ['./vendor-products.component.scss']
})
export class VendorProductsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  public location = inject(Location);

  products = signal<Product[]>([]);
  isLoading = signal(true);
  isAddModalOpen = signal(false);
  isSubmitting = signal(false);
  activeCategory = signal<string>('all');
  
  // Image handling
  imageBase64 = signal<string | null>(null);
  fileName = signal<string | null>(null);

  readonly categories: ProductCategoryOption[] = [
    { value: 'shoes', label: 'Chaussures', icon: 'footprint' },
    { value: 'equipment', label: 'Équipement', icon: 'sports_soccer' },
    { value: 'apparel', label: 'Vêtements', icon: 'checkroom' },
    { value: 'accessories', label: 'Accessoires', icon: 'backpack' },
    { value: 'beverages', label: 'Boissons & Alimentation', icon: 'local_drink' },
  ];

  readonly filterTabs = [
    { value: 'all', label: 'Tous', icon: 'apps' },
    ...this.categories
  ];

  readonly filteredProducts = computed(() => {
    const cat = this.activeCategory();
    const list = this.products().map(p => {
      const lower = (p.name || '').toLowerCase();
      let category = p.category;
      if (!category || category === 'equipment') {
        if (lower.includes('eau') || lower.includes('bouteille') || lower.includes('boisson')) {
          category = 'beverages';
        }
      }
      return { ...p, category: category || 'equipment' };
    });

    if (cat === 'all') return list;
    return list.filter(p => p.category === cat);
  });

  productForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    category: ['beverages', [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    price: [0, [Validators.required, Validators.min(0)]],
    stock_quantity: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    this.fetchProducts();
  }

  fetchProducts(): void {
    this.isLoading.set(true);
    this.api.get<any>('/products/vendor').subscribe({
      next: (res) => {
        this.products.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  editingProductId = signal<string | null>(null);

  openAddModal(): void {
    this.editingProductId.set(null);
    this.productForm.reset({ category: 'beverages', price: 0, stock_quantity: 0 });
    this.imageBase64.set(null);
    this.fileName.set(null);
    this.isAddModalOpen.set(true);
  }

  openEditModal(product: Product): void {
    this.editingProductId.set(product.id);
    this.productForm.patchValue({
      name: product.name,
      category: product.category || 'equipment',
      description: product.description,
      price: product.price,
      stock_quantity: product.stock_quantity,
    });
    this.imageBase64.set(product.image_url);
    this.fileName.set(null);
    this.isAddModalOpen.set(true);
  }

  closeAddModal(): void {
    this.isAddModalOpen.set(false);
    this.editingProductId.set(null);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.fileName.set(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        this.imageBase64.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  getCategoryLabel(cat?: string, name?: string): string {
    const lower = (name || '').toLowerCase();
    if (lower.includes('eau') || lower.includes('bouteille') || lower.includes('boisson')) {
      return 'Boissons & Alimentation';
    }
    const found = this.categories.find(c => c.value === cat);
    return found ? found.label : (cat || 'Équipement');
  }

  getCategoryIcon(cat?: string, name?: string): string {
    const lower = (name || '').toLowerCase();
    if (lower.includes('eau') || lower.includes('bouteille') || lower.includes('boisson')) {
      return 'local_drink';
    }
    const found = this.categories.find(c => c.value === cat);
    return found ? found.icon : 'inventory_2';
  }

  saveProduct() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      ...this.productForm.value,
      image_url: this.imageBase64(),
    };

    const editId = this.editingProductId();
    if (editId) {
      this.api.put<any>(`/products/${editId}`, payload).subscribe({
        next: (res) => {
          this.products.update(list => list.map(p => p.id === editId ? (res.data || { ...p, ...payload }) : p));
          this.isSubmitting.set(false);
          this.closeAddModal();
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
    } else {
      this.api.post<any>('/products', payload).subscribe({
        next: (res) => {
          this.products.update(list => [res.data, ...list]);
          this.isSubmitting.set(false);
          this.closeAddModal();
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
    }
  }

  deleteProduct(id: string) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet article de votre catalogue ?')) {
      this.api.delete<any>(`/products/${id}`).subscribe({
        next: () => {
          this.products.update(list => list.filter(p => p.id !== id));
        }
      });
    }
  }
}
