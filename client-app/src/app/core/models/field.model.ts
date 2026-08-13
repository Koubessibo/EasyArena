export type SportCategory = 'football' | 'basketball' | 'tennis' | 'padel' | 'volleyball' | 'handball';

export interface FieldAmenity {
  id: string;
  name: string;
  icon: string;
  available: boolean;
}

export interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
  price?: number;
}

export interface DaySchedule {
  day: string;
  shortDay: string;
  date: string;
  slots: TimeSlot[];
}

export interface FieldOwner {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  rating: number;
  totalFields: number;
}

export interface Field {
  id: string;
  name: string;
  description: string;
  sport: SportCategory;
  address: string;
  city: string;
  district: string;
  contactPhone?: string;
  contactEmail?: string;
  googleMapsUrl?: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  rating: number;
  reviewCount: number;
  distance?: number; // km
  imageUrl: string;
  images: string[];
  amenities: FieldAmenity[];
  owner: FieldOwner;
  capacity: number;
  surface: string; // 'synthetic_turf' | 'natural_grass' | 'parquet' | 'hard_court' | 'clay' | 'sand'
  hasLighting?: boolean;
  hasChangingRooms?: boolean;
  hasParking?: boolean;
  hasCafeteria?: boolean;
  hasWifi?: boolean;
  providesEquipment?: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  schedule: DaySchedule[];
}
