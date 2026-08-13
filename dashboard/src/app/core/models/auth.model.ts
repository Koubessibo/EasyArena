export type UserRole = 'super_admin' | 'field_owner' | 'vendor' | 'field_admin' | 'controller' | 'client';

export interface DashboardUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: string;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt: string;
  can_withdraw?: boolean;
}
