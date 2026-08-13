export type ProductCategory = 'all' | 'beverages' | 'shoes' | 'equipment' | 'apparel' | 'accessories';

export interface ProductVendor {
  id: string;
  name: string;
  description: string;
  avatarUrl?: string;
  isVerified: boolean;
  rating: number;
  totalProducts: number;
  location: string;
  phone?: string;
}

export interface ProductImage {
  url: string;
  alt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  originalPrice?: number; // if on sale
  currency: 'FCFA';
  rating: number;
  reviewCount: number;
  images: ProductImage[];
  imageUrl: string; // primary image
  vendor: ProductVendor;
  brand: string;
  tags: string[];
  isAvailable: boolean;
  isFeatured: boolean;
  isWishlisted?: boolean;
  stock: number;
  sport: string;
}

