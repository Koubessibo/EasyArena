import { Injectable, signal, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Field, FieldPhoto, BookingSlot, FieldType, FieldStatus } from '../models/field.model';
import { Transaction, WithdrawalRequest } from '../models/transaction.model';
import { ApiService } from './api.service';

const SPORT_TYPE_MAP: Record<string, FieldType> = {
  football: 'football',
  basketball: 'basketball',
  tennis: 'tennis',
  padel: 'padel',
  volleyball: 'volleyball',
  other: 'multi',
};

const SPORT_TYPE_REVERSE: Record<FieldType, string> = {
  football: 'football',
  basketball: 'basketball',
  tennis: 'tennis',
  padel: 'padel',
  volleyball: 'volleyball',
  multi: 'other',
};

const FIELD_STATUS_MAP: Record<string, FieldStatus> = {
  available: 'active',
  maintenance: 'maintenance',
  inactive: 'inactive',
};

const FIELD_STATUS_REVERSE: Record<FieldStatus, string> = {
  active: 'available',
  maintenance: 'maintenance',
  inactive: 'inactive',
};

const BOOKING_STATUS_MAP: Record<string, BookingSlot['status']> = {
  pending_payment: 'pending',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
  expired: 'cancelled',
};

const TX_TYPE_MAP: Record<string, Transaction['type']> = {
  BOOKING_CREDIT: 'booking_payment',
  WITHDRAWAL_DEBIT: 'withdrawal',
  REFUND_CREDIT: 'refund',
  FEE_DEBIT: 'platform_fee',
};

function mapField(f: any): Field {
  return {
    id: f.id,
    name: f.name,
    type: SPORT_TYPE_MAP[f.sport_type] ?? 'multi',
    status: FIELD_STATUS_MAP[f.status] ?? 'inactive',
    pricePerHour: Number(f.schedules?.[0]?.price_per_slot ?? 0),
    depositPerHour: f.schedules?.[0]?.deposit_per_slot != null ? Number(f.schedules[0].deposit_per_slot) : null,
    location: f.address ?? '',
    contactPhone: f.contact_phone ?? '',
    contactEmail: f.contact_email ?? '',
    googleMapsUrl: f.google_maps_url ?? '',
    surfaceType: f.surface_type ?? 'synthetic_turf',
    hasLighting: f.has_lighting ?? true,
    hasChangingRooms: f.has_changing_rooms ?? true,
    hasParking: f.has_parking ?? true,
    hasCafeteria: f.has_cafeteria ?? false,
    hasWifi: f.has_wifi ?? false,
    providesEquipment: f.provides_equipment ?? true,
    latitude: Number(f.latitude ?? 0),
    longitude: Number(f.longitude ?? 0),
    capacity: Number(f.capacity ?? 0),
    imageUrl: f.photos?.find((p: any) => p.is_cover)?.url,
    photos: (f.photos ?? []).map((p: any): FieldPhoto => ({ id: p.id, url: p.url, is_cover: p.is_cover })),
    ownerId: f.owner_id ?? '',
    createdAt: f.created_at ?? '',
  };
}

function mapBooking(b: any): BookingSlot {
  const firstName = b.client?.user?.first_name ?? '';
  const lastName = b.client?.user?.last_name ?? '';
  const rawPaid = Number(b.payment?.amount ?? 0);
  const totalWithFee = Number(b.total_amount ?? 0) + Number(b.service_fee ?? 0);
  const paidAmount = rawPaid === 0
    ? 0
    : rawPaid >= totalWithFee && totalWithFee > 0
      ? Number(b.total_amount ?? 0)
      : rawPaid - Math.round(rawPaid * 0.05 / 1.05);
  return {
    id: b.id,
    fieldId: b.field_id ?? b.field?.id ?? '',
    fieldName: b.field?.name ?? '',
    clientName: `${firstName} ${lastName}`.trim() || 'Inconnu',
    firstName,
    lastName,
    clientPhone: b.client?.user?.phone ?? '',
    date: b.booking_date ?? '',
    startTime: b.slot_start ?? '',
    endTime: b.slot_end ?? '',
    status: BOOKING_STATUS_MAP[b.status] ?? 'pending',
    amount: Number(b.total_amount ?? 0),
    paidAmount,
    createdAt: b.created_at ?? '',
  };
}

function mapTransaction(t: any): Transaction {
  const type = TX_TYPE_MAP[t.type] ?? 'booking_payment';
  const isDebit = t.direction === 'DEBIT';
  return {
    id: t.id,
    type,
    description: t.description ?? '',
    amount: isDebit ? -Math.abs(Number(t.amount ?? 0)) : Math.abs(Number(t.amount ?? 0)),
    status: 'completed',
    createdAt: t.created_at ?? '',
  };
}

const WITHDRAWAL_STATUS_MAP: Record<string, WithdrawalRequest['status']> = {
  pending_validation: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  processed: 'completed',
};

function mapWithdrawal(w: any): WithdrawalRequest {
  return {
    id: w.id,
    amount: Number(w.amount),
    method: w.method,
    destination: w.destination,
    operator: w.operator,
    status: WITHDRAWAL_STATUS_MAP[w.status] ?? 'pending',
    rejectionNote: w.rejection_note,
    ribUrl: w.rib_url,
    requestedAt: w.requested_at,
    processedAt: w.processed_at,
  };
}

@Injectable({ providedIn: 'root' })
export class FieldOwnerService {
  private api = inject(ApiService);

  readonly fields = signal<Field[]>([]);
  readonly bookings = signal<BookingSlot[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly balance = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly withdrawals = signal<WithdrawalRequest[]>([]);

  readonly weeklyEarnings = signal([
    { day: 'Lun', value: 0 },
    { day: 'Mar', value: 0 },
    { day: 'Mer', value: 0 },
    { day: 'Jeu', value: 0 },
    { day: 'Ven', value: 0 },
    { day: 'Sam', value: 0 },
    { day: 'Dim', value: 0 },
  ]);

  loadFields(): void {
    this.api.get<any>('/fields/owner/fields').subscribe({
      next: (res) => this.fields.set((res.data ?? []).map(mapField)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadBookings(): void {
    this.api.get<any>('/owner/bookings?per_page=50&status=confirmed').subscribe({
      next: (res) => this.bookings.set((res.data ?? []).map(mapBooking)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadBalance(): void {
    this.api.get<any>('/owner/balance').subscribe({
      next: (res) => this.balance.set(Number(res.balance_available ?? 0)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  loadTransactions(): void {
    this.api.get<any>('/owner/transactions?per_page=50').subscribe({
      next: (res) => this.transactions.set((res.data ?? []).map(mapTransaction)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  addField(field: Omit<Field, 'id' | 'createdAt'>): Observable<Field> {
    const dto = {
      name: field.name,
      sport_type: SPORT_TYPE_REVERSE[field.type] ?? 'football',
      address: field.location,
      contact_phone: field.contactPhone || undefined,
      contact_email: field.contactEmail || undefined,
      google_maps_url: field.googleMapsUrl || undefined,
      surface_type: field.surfaceType ?? 'synthetic_turf',
      has_lighting: field.hasLighting ?? true,
      has_changing_rooms: field.hasChangingRooms ?? true,
      has_parking: field.hasParking ?? true,
      has_cafeteria: field.hasCafeteria ?? false,
      has_wifi: field.hasWifi ?? false,
      provides_equipment: field.providesEquipment ?? true,
      latitude: field.latitude ?? 0,
      longitude: field.longitude ?? 0,
      capacity: field.capacity,
      status: FIELD_STATUS_REVERSE[field.status] ?? 'available',
      schedules: [{
        open_at: '08:00',
        close_at: '22:00',
        slot_duration_min: 60,
        price_per_slot: field.pricePerHour,
        deposit_per_slot: field.depositPerHour && field.depositPerHour > 0 ? field.depositPerHour : null,
      }],
    };
    return this.api.post<any>('/fields', dto).pipe(map(f => mapField(f)));
  }

  updateField(id: string, updates: Partial<Field>): Observable<Field> {
    const dto: Record<string, unknown> = {};
    if (updates.name) dto['name'] = updates.name;
    if (updates.type) dto['sport_type'] = SPORT_TYPE_REVERSE[updates.type];
    if (updates.location) dto['address'] = updates.location;
    if (updates.contactPhone !== undefined) dto['contact_phone'] = updates.contactPhone;
    if (updates.contactEmail !== undefined) dto['contact_email'] = updates.contactEmail;
    if (updates.googleMapsUrl !== undefined) dto['google_maps_url'] = updates.googleMapsUrl;
    if (updates.surfaceType !== undefined) dto['surface_type'] = updates.surfaceType;
    if (updates.hasLighting !== undefined) dto['has_lighting'] = updates.hasLighting;
    if (updates.hasChangingRooms !== undefined) dto['has_changing_rooms'] = updates.hasChangingRooms;
    if (updates.hasParking !== undefined) dto['has_parking'] = updates.hasParking;
    if (updates.hasCafeteria !== undefined) dto['has_cafeteria'] = updates.hasCafeteria;
    if (updates.hasWifi !== undefined) dto['has_wifi'] = updates.hasWifi;
    if (updates.providesEquipment !== undefined) dto['provides_equipment'] = updates.providesEquipment;
    if (updates.latitude !== undefined) dto['latitude'] = updates.latitude;
    if (updates.longitude !== undefined) dto['longitude'] = updates.longitude;
    if (updates.status) dto['status'] = FIELD_STATUS_REVERSE[updates.status];
    if (updates.capacity !== undefined) dto['capacity'] = updates.capacity;
    if (updates.pricePerHour !== undefined || updates.depositPerHour !== undefined) {
      dto['schedules'] = [{
        open_at: '08:00',
        close_at: '22:00',
        slot_duration_min: 60,
        price_per_slot: updates.pricePerHour,
        deposit_per_slot: updates.depositPerHour && updates.depositPerHour > 0 ? updates.depositPerHour : null,
      }];
    }
    return this.api.put<any>(`/fields/${id}`, dto).pipe(map(f => mapField(f)));
  }

  // ── Schedule ──────────────────────────────────────────────────────────────

  getSchedule(fieldId: string): Observable<any> {
    return this.api.get<any>(`/fields/${fieldId}`).pipe(
      map(f => f.schedules?.[0] ?? null)
    );
  }

  updateSchedule(fieldId: string, scheduleId: string, dto: {
    open_at?: string; close_at?: string; slot_duration_min?: number;
    price_per_slot?: number; deposit_per_slot?: number | null;
  }): Observable<any> {
    return this.api.put<any>(`/fields/${fieldId}/schedules/${scheduleId}`, dto);
  }

  createSchedule(fieldId: string, dto: {
    open_at: string; close_at: string; slot_duration_min: number;
    price_per_slot: number; deposit_per_slot?: number | null;
  }): Observable<any> {
    return this.api.post<any>(`/fields/${fieldId}/schedules`, dto);
  }

  // ── Day blocks ────────────────────────────────────────────────────────────

  getDayBlocks(fieldId: string, dateFrom?: string, dateTo?: string): Observable<any[]> {
    let url = `/fields/${fieldId}/day-blocks/manage`;
    if (dateFrom) url += `?date_from=${dateFrom}`;
    if (dateTo) url += (dateFrom ? '&' : '?') + `date_to=${dateTo}`;
    return this.api.get<any>(url).pipe(map(res => Array.isArray(res) ? res : (res.data ?? [])));
  }

  blockDay(fieldId: string, date: string, note?: string): Observable<any> {
    return this.api.post<any>(`/fields/${fieldId}/day-blocks`, { date, note });
  }

  unblockDay(fieldId: string, blockId: string): Observable<any> {
    return this.api.delete<any>(`/fields/${fieldId}/day-blocks/${blockId}`);
  }

  // ── Slot blocks ───────────────────────────────────────────────────────────

  getSlotBlocks(fieldId: string, date: string): Observable<any[]> {
    return this.api.get<any>(`/fields/${fieldId}/slot-blocks?date=${date}`).pipe(
      map(res => Array.isArray(res) ? res : (res.data ?? []))
    );
  }

  blockSlot(fieldId: string, date: string, slotStart: string): Observable<any> {
    return this.api.post<any>(`/fields/${fieldId}/slot-blocks`, { date, slot_start: slotStart });
  }

  unblockSlot(fieldId: string, blockId: string): Observable<any> {
    return this.api.delete<any>(`/fields/${fieldId}/slot-blocks/${blockId}`);
  }

  uploadFieldPhoto(fieldId: string, file: File, isCover: boolean): Observable<any> {
    const fd = new FormData();
    fd.append('photo', file);
    return this.api.postFile<any>(`/fields/${fieldId}/photos?is_cover=${isCover}`, fd);
  }

  deleteFieldPhoto(fieldId: string, photoId: string): Observable<any> {
    return this.api.delete<any>(`/fields/${fieldId}/photos/${photoId}`);
  }

  deleteField(id: string, onError?: (err: Error) => void): void {
    this.api.delete<any>(`/fields/${id}`).subscribe({
      next: () => this.fields.update(list => list.filter(f => f.id !== id)),
      error: (err: Error) => {
        this.error.set(err.message);
        onError?.(err);
      },
    });
  }

  loadWithdrawals(): void {
    this.api.get<any>('/owner/withdrawals?per_page=50').subscribe({
      next: (res) => this.withdrawals.set((res.data ?? []).map(mapWithdrawal)),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  sendWithdrawalOtp(): Observable<any> {
    return this.api.post<any>('/owner/withdrawals/send-otp', {});
  }

  uploadRib(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('rib', file);
    return this.api.postFile<{ url: string }>('/owner/withdrawals/upload-rib', fd);
  }

  // ── Cancellation requests ─────────────────────────────────────────────

  readonly cancellationRequests = signal<any[]>([]);

  loadCancellationRequests(): void {
    this.api.get<any>('/owner/cancellation-requests').subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res.data ?? []);
        this.cancellationRequests.set(list.map((cr: any) => ({
          id: cr.id,
          bookingId: cr.booking_id,
          reason: cr.reason,
          status: cr.status,
          rejectionNote: cr.rejection_note,
          requestedAt: cr.requested_at,
          processedAt: cr.processed_at,
          clientName: `${cr.booking?.client?.user?.first_name ?? ''} ${cr.booking?.client?.user?.last_name ?? ''}`.trim() || 'Inconnu',
          clientPhone: cr.booking?.client?.user?.phone ?? '',
          fieldName: cr.booking?.field?.name ?? '',
          bookingDate: cr.booking?.booking_date ?? '',
          slotStart: cr.booking?.slot_start ?? '',
          slotEnd: cr.booking?.slot_end ?? '',
          amount: Number(cr.booking?.total_amount ?? 0),
        })));
      },
      error: (err: Error) => this.error.set(err.message),
    });
  }

  validateCancellationRequest(id: string, action: 'approve' | 'reject', rejectionNote?: string): Observable<any> {
    return this.api.put<any>(`/owner/cancellation-requests/${id}/validate`, {
      action,
      rejection_note: rejectionNote,
    });
  }

  // ── Staff ────────────────────────────────────────────────────────────

  listStaff(): Observable<any[]> {
    return this.api.get<any>('/owner/staff').pipe(
      map((res: any) => {
        const list = Array.isArray(res) ? res : (res.data ?? []);
        return list.map((s: any) => ({
          id: s.id,
          firstName: s.user?.first_name ?? '',
          lastName: s.user?.last_name ?? '',
          phone: s.user?.phone ?? '',
          role: s.user?.role ?? '',
          createdAt: s.user?.created_at ?? '',
          can_withdraw: s.can_withdraw ?? false,
        }));
      }),
    );
  }

  createStaff(dto: { first_name: string; last_name: string; phone: string; role: string }): Observable<any> {
    return this.api.post<any>('/owner/staff', dto);
  }

  deleteStaff(staffId: string): Observable<any> {
    return this.api.delete<any>(`/owner/staff/${staffId}`);
  }

  updateStaffCanWithdraw(staffId: string, canWithdraw: boolean): Observable<any> {
    return this.api.put<any>(`/owner/staff/${staffId}/can-withdraw`, { can_withdraw: canWithdraw });
  }

  loadTransactionsFiltered(page: number, perPage: number, startDate?: string, endDate?: string): Observable<{ data: Transaction[]; total: number }> {
    let url = `/owner/transactions?page=${page}&per_page=${perPage}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    return this.api.get<any>(url).pipe(
      map((res: any) => ({
        data: (res.data ?? []).map(mapTransaction),
        total: res.total ?? 0,
      })),
    );
  }

  loadWithdrawalsFiltered(page: number, perPage: number, startDate?: string, endDate?: string): Observable<{ data: WithdrawalRequest[]; total: number }> {
    let url = `/owner/withdrawals?page=${page}&per_page=${perPage}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    return this.api.get<any>(url).pipe(
      map((res: any) => ({
        data: (res.data ?? []).map(mapWithdrawal),
        total: res.total ?? 0,
      })),
    );
  }

  requestWithdrawal(
    amount: number,
    method: string,
    destination: string,
    operator: string | null,
    otpCode: string,
    ribUrl?: string,
  ) {
    return this.api.post<any>('/owner/withdrawals', {
      amount,
      method,
      destination,
      operator: operator || undefined,
      otp_code: otpCode,
      rib_url: ribUrl,
    });
  }
}
