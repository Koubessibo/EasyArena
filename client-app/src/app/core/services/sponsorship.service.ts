import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface SponsorshipMyStats {
  is_ambassador: boolean;
  is_vip?: boolean;
  effective_n1_rate?: number;
  effective_n2_rate?: number;
  effective_duration_months?: number;
  custom_n1_rate?: number | null;
  custom_n2_rate?: number | null;
  custom_duration_months?: number | null;
  referral_code: string;
  wallet_balance: number;
  n1_count: number;
  n2_count: number;
  total_earned: number;
  recent_commissions: Array<{
    id: string;
    amount: number;
    level: number;
    net_revenue_base: number;
    created_at: string;
  }>;
  referrals: Array<{
    id: string;
    level: number;
    referee_name: string;
    referee_role: string;
    created_at: string;
    expires_at: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class SponsorshipService {
  private api = inject(ApiService);

  getMyStats(): Observable<SponsorshipMyStats> {
    return this.api.get<SponsorshipMyStats>('/sponsorship/my-stats');
  }

  sendWithdrawOtp(): Observable<any> {
    return this.api.post<any>('/sponsorship/withdraw/otp', {});
  }

  withdraw(data: { amount: number; phone: string; operator: string; otp_code: string }): Observable<any> {
    return this.api.post<any>('/sponsorship/withdraw', data);
  }
}
