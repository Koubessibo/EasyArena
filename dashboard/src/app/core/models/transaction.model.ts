export type TransactionType = 'booking_payment' | 'product_sale' | 'withdrawal' | 'platform_fee' | 'refund';
export type TransactionStatus = 'completed' | 'pending' | 'failed';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  status: TransactionStatus;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  amount: number;
  method: 'mobile_money' | 'bank_transfer';
  destination: string;
  operator: string | null;
  status: WithdrawalStatus;
  rejectionNote?: string;
  ribUrl?: string;
  requestedAt: string;
  processedAt?: string;
}

export interface AdminWithdrawalRequest extends WithdrawalRequest {
  userId: string;
  userName: string;
}

export interface PlatformStats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  activeNow: number;
  newUsersToday: number;
  bookingsToday: number;
  revenueToday: number;
}
