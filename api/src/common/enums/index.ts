export enum Role {
  CLIENT = 'client',
  OWNER = 'owner',
  VENDOR = 'vendor',
  ADMIN = 'admin',
  FIELD_ADMIN = 'field_admin',
  CONTROLLER = 'controller',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum SportType {
  FOOTBALL = 'football',
  BASKETBALL = 'basketball',
  TENNIS = 'tennis',
  PADEL = 'padel',
  HANDBALL = 'handball',
  VOLLEYBALL = 'volleyball',
  OTHER = 'other',
}

export enum FieldStatus {
  AVAILABLE = 'available',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
}

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

export enum BookingStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLATION_PENDING = 'cancellation_pending',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum PaymentMethod {
  MOBILE_MONEY = 'mobile_money',
  CARD = 'card',
}

export enum MobileOperator {
  WAVE = 'WAVE',
  ORANGE_MONEY = 'ORANGE_MONEY',
  FREE_MONEY = 'FREE_MONEY',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum ArticleCategory {
  FOOTWEAR = 'footwear',
  CLOTHING = 'clothing',
  EQUIPMENT = 'equipment',
  OTHER = 'other',
}

export enum ArticleStatus {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
  HIDDEN = 'hidden',
}

export enum TransactionType {
  BOOKING_CREDIT = 'BOOKING_CREDIT',
  WITHDRAWAL_DEBIT = 'WITHDRAWAL_DEBIT',
  REFUND_CREDIT = 'REFUND_CREDIT',
  REFUND_DEBIT = 'REFUND_DEBIT',
  FEE_DEBIT = 'FEE_DEBIT',
}

export enum TransactionDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionSourceType {
  PAYMENT = 'PAYMENT',
  WITHDRAWAL = 'WITHDRAWAL',
  REFUND = 'REFUND',
}

export enum WithdrawalMethod {
  MOBILE_MONEY = 'mobile_money',
  BANK_TRANSFER = 'bank_transfer',
}

export enum WithdrawalStatus {
  PENDING_VALIDATION = 'pending_validation',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PROCESSED = 'processed',
}

export enum CancellationRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum NotificationChannel {
  SMS = 'sms',
  EMAIL = 'email',
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

export enum SubscriptionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
}

export enum InstallmentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  OVERDUE = 'overdue',
}

export enum SponsorType {
  CLIENT = 'CLIENT',
  AMBASSADOR = 'AMBASSADOR',
}

export enum SponsorshipCommissionStatus {
  PENDING = 'PENDING',
  AVAILABLE = 'AVAILABLE',
  CANCELLED = 'CANCELLED',
  CREDITED = 'CREDITED',
}

