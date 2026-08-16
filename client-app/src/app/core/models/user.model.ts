export type UserRole = 'customer' | 'field_owner' | 'vendor' | 'event_organizer';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt: string;
  is_ambassador?: boolean;
}

export interface AuthCredentials {
  identifier: string; // phone or email
  password: string;
}

export interface RegisterData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface OtpVerifyData {
  phone: string;
  otp: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
