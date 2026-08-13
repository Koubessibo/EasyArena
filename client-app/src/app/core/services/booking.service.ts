import { Injectable, signal, inject } from '@angular/core';
import { Observable, tap, map } from 'rxjs';
import { ApiService } from './api.service';
import { Booking, CreateBookingData, PaymentData, PaymentInitiateResponse, MobileOperator, calculateBookingPricing } from '../models/booking.model';

const PAYMENT_METHOD_MAP: Record<string, string> = {
  mtn_mobile_money: 'mobile_money',
  orange_money: 'mobile_money',
  free_money: 'mobile_money',
  wave: 'mobile_money',
  bank_card: 'card',
};

const OPERATOR_MAP: Record<string, MobileOperator> = {
  wave: 'WAVE',
  orange_money: 'ORANGE_MONEY',
};

function mapApiBooking(b: any): Booking {
  const pricePerHour = b.total_amount ?? 0;
  const minDepositAmount = b.min_deposit_amount != null ? Number(b.min_deposit_amount) : null;
  return {
    id: b.id,
    fieldId: b.field_id ?? '',
    fieldName: b.field?.name ?? '',
    fieldImageUrl: b.field?.photos?.find((p: any) => p.is_cover)?.url ?? b.field?.photos?.[0]?.url ?? '',
    fieldAddress: b.field?.address ?? '',
    userId: b.client_id ?? '',
    date: b.booking_date ?? '',
    startTime: b.slot_start ?? '',
    endTime: b.slot_end ?? '',
    status: mapStatus(b.status),
    payment: {
      method: (b.payment?.method as any) ?? 'orange_money',
      status: mapPaymentStatus(b.payment?.status),
      transactionId: b.payment?.external_ref,
      paidAt: b.payment?.paid_at,
    },
    pricing: { ...calculateBookingPricing(pricePerHour, 1), minDepositAmount },
    createdAt: b.created_at ?? '',
  };
}

function mapStatus(s: string): any {
  switch (s) {
    case 'confirmed': return 'confirmed';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
    case 'pending':
    case 'pending_payment': return 'pending';
    default: return 'pending';
  }
}

function mapPaymentStatus(s: string): any {
  switch (s) {
    case 'success': return 'paid';
    case 'failed': return 'failed';
    case 'refunded': return 'refunded';
    default: return 'pending';
  }
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private api = inject(ApiService);

  readonly bookings = signal<Booking[]>([]);
  readonly pendingBooking = signal<Partial<Booking> | null>(null);
  readonly loading = signal(false);

  getBookings(): Observable<Booking[]> {
    return this.api.get<any>('/bookings').pipe(
      map(res => (Array.isArray(res) ? res : (res.data ?? [])).map(mapApiBooking)),
      tap(list => this.bookings.set(list))
    );
  }

  getUpcomingBookings(): Observable<Booking[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getBookings().pipe(
      map(list => list.filter(b => b.date >= today && (b.status === 'confirmed' || b.status === 'pending')))
    );
  }

  getPastBookings(): Observable<Booking[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getBookings().pipe(
      map(list => list.filter(b => b.date < today || b.status === 'completed' || b.status === 'cancelled'))
    );
  }

  getBookingById(id: string): Observable<Booking | undefined> {
    return this.api.get<any>(`/bookings/${id}`).pipe(
      map(b => b ? mapApiBooking(b) : undefined)
    );
  }

  createBooking(data: CreateBookingData): Observable<Booking> {
    const dto: Record<string, unknown> = {
      field_id: data.fieldId,
      schedule_id: data.scheduleId,
      booking_date: data.date,
      slot_start: data.startTime,
    };
    if (data.numSlots && data.numSlots > 1) dto['num_slots'] = data.numSlots;
    return this.api.post<any>('/bookings', dto).pipe(
      map(b => mapApiBooking(b)),
      tap(b => {
        this.pendingBooking.set(b);
        this.bookings.update(list => [b, ...list]);
      })
    );
  }

  processPayment(data: PaymentData): Observable<PaymentInitiateResponse> {
    const dto: Record<string, unknown> = {
      method: PAYMENT_METHOD_MAP[data.method] ?? 'mobile_money',
      operator: data.operator ?? OPERATOR_MAP[data.method],
      phone: data.phoneNumber,
    };
    if (data.paidAmount !== undefined) dto['paid_amount'] = data.paidAmount;
    return this.api.post<PaymentInitiateResponse>(`/bookings/${data.bookingId}/payment`, dto).pipe(
      tap(() => this.pendingBooking.set(null))
    );
  }

  requestCancellation(id: string, reason?: string): Observable<any> {
    return this.api.post<any>(`/bookings/${id}/cancel-request`, { reason });
  }

  getCancellationRequest(id: string): Observable<any> {
    return this.api.get<any>(`/bookings/${id}/cancel-request`);
  }

  rateBooking(_id: string, _rating: number, _comment: string): Observable<{ success: boolean }> {
    // No rating API endpoint — no-op
    return new Observable(obs => { obs.next({ success: true }); obs.complete(); });
  }
}
