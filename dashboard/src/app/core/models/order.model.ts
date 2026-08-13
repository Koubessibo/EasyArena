import { Product } from './product.model';

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'DELIVERED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  product: Product;
}

export interface Order {
  id: string;
  client_id: string;
  vendor_id: string;
  reference: string;
  total_amount: number;
  status: OrderStatus;
  payment_phone?: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}
