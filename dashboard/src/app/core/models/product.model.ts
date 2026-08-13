export type ProductCategory = 'equipment' | 'shoes' | 'apparel' | 'accessories';
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock';
export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

export interface ProductPhoto {
  id: string;
  url: string;
  is_cover: boolean;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  category: ProductCategory;
  price: number;
  stock: number;
  status: ProductStatus;
  imageUrl?: string;
  image_url?: string;
  photos?: ProductPhoto[];
  vendorId: string;
  createdAt: string;
}

export interface Order {
  id: string;
  reference: string;
  clientName: string;
  clientPhone: string;
  products: { name: string; qty: number }[];
  amount: number;
  status: OrderStatus;
  createdAt: string;
}
