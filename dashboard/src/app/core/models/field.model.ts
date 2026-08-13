export type FieldStatus = 'active' | 'inactive' | 'maintenance';
export type FieldType = 'football' | 'basketball' | 'tennis' | 'padel' | 'volleyball' | 'multi';

export interface FieldPhoto {
  id: string;
  url: string;
  is_cover: boolean;
}

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  status: FieldStatus;
  pricePerHour: number;
  depositPerHour?: number | null;
  location: string;
  contactPhone?: string;
  contactEmail?: string;
  googleMapsUrl?: string;
  surfaceType?: string;
  hasLighting?: boolean;
  hasChangingRooms?: boolean;
  hasParking?: boolean;
  hasCafeteria?: boolean;
  hasWifi?: boolean;
  providesEquipment?: boolean;
  latitude?: number;
  longitude?: number;
  capacity: number;
  imageUrl?: string;
  photos?: FieldPhoto[];
  ownerId: string;
  createdAt: string;
}

export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'maintenance';

export interface BookingSlot {
  id: string;
  fieldId: string;
  fieldName: string;
  clientName: string;
  firstName: string;
  lastName: string;
  clientPhone: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  amount: number;
  paidAmount: number;
  createdAt: string;
}
