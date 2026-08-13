import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../core/services/product.service';
import { Product, ProductCategory } from '../../../core/models/product.model';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card.component';

interface CategoryTab {
  label: string;
  value: ProductCategory;
  icon: string;
}

@Component({
  selector: 'app-product-catalog',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, ProductCardComponent],
  templateUrl: './product-catalog.component.html',
  styleUrl: './product-catalog.component.scss',
})
export class ProductCatalogComponent implements OnInit {
  private productService = inject(ProductService);

  activeCategory = signal<ProductCategory>('all');
  products = signal<Product[]>([]);
  loading = signal(true);
  searchQuery = signal('');

  readonly categories: CategoryTab[] = [
    { label: 'Tous', value: 'all', icon: 'apps' },
    { label: 'Boissons & Alimentation', value: 'beverages', icon: 'local_drink' },
    { label: 'Chaussures', value: 'shoes', icon: 'footprint' },
    { label: 'Équipement', value: 'equipment', icon: 'sports_soccer' },
    { label: 'Vêtements', value: 'apparel', icon: 'checkroom' },
    { label: 'Accessoires', value: 'accessories', icon: 'backpack' },
  ];

  ngOnInit(): void {
    this.productService.getProducts().subscribe(prods => {
      this.products.set(prods);
      this.loading.set(false);
    });
  }

  selectCategory(category: ProductCategory): void {
    this.activeCategory.set(category);
    this.productService.getProducts(category).subscribe(prods => {
      this.products.set(prods);
    });
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
    if (!query.trim()) {
      this.selectCategory(this.activeCategory());
      return;
    }
    this.productService.searchProducts(query).subscribe(prods => {
      this.products.set(prods);
    });
  }
}
