export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'mtn_mobile_money' | 'orange_money' | 'free_money' | 'bank_card' | 'wave';
export type MobileOperator = 'WAVE' | 'ORANGE_MONEY';

export interface BookingPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  paidAt?: string;
  phoneNumber?: string;
}

export interface BookingPricing {
  hourlyRate: number;
  durationHours: number;
  subtotal: number;
  serviceFeePercent: number;
  serviceFeeFixed: number;
  serviceFee: number;
  total: number;
  minDepositAmount: number | null;
}

export interface Booking {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldImageUrl: string;
  fieldAddress: string;
  userId: string;
  date: string; // ISO date string
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: BookingStatus;
  payment: BookingPayment;
  pricing: BookingPricing;
  notes?: string;
  createdAt: string;
}

export interface CreateBookingData {
  fieldId: string;
  date: string;
  scheduleId: string;
  startTime: string;
  endTime: string;
  numSlots?: number;
  notes?: string;
}

export interface PaymentData {
  bookingId: string;
  method: PaymentMethod;
  operator?: MobileOperator;
  phoneNumber?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  paidAmount?: number;
}

export interface PaymentInitiateResponse {
  payment_id: string;
  external_ref: string;
  redirect_url?: string;
  urls?: { OM?: string; MAXIT?: string };
  qr_code?: string;
}

// Service fee calculation: 5% of subtotal
export function calculateServiceFee(subtotal: number): number {
  return Math.round(subtotal * 0.05);
}

export function calculateBookingPricing(hourlyRate: number, durationHours: number, depositPerSlot?: number | null): BookingPricing {
  const subtotal = hourlyRate * durationHours;
  const serviceFee = calculateServiceFee(subtotal);
  const numSlots = durationHours; // 1 slot = 1 hour in current system
  const minDepositAmount = depositPerSlot != null && depositPerSlot > 0
    ? depositPerSlot * numSlots
    : null;
  return {
    hourlyRate,
    durationHours,
    subtotal,
    serviceFeePercent: 5,
    serviceFeeFixed: 0,
    serviceFee,
    total: subtotal + serviceFee,
    minDepositAmount,
  };
}
