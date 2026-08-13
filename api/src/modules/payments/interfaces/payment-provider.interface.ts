import { MobileOperator } from '../../../common/enums';

export interface InitiatePaymentParams {
  amount: number;
  operator?: MobileOperator;
  reference: string;
  phone?: string;
  callbackUrl?: string;
  returnUrl?: string;
}

export interface InitiatePaymentResult {
  external_ref: string;
  redirect_url?: string;
  urls?: { OM?: string; MAXIT?: string };
  qr_code?: string;
}

export interface CashOutParams {
  amount: number;
  operator: MobileOperator;
  phoneNumber: string;
  reference?: string;
}

export interface CashOutResult {
  success: boolean;
  external_ref?: string;
  message?: string;
}

export interface IPaymentProvider {
  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  cashOut(params: CashOutParams): Promise<CashOutResult>;
  verifyWebhook(rawBody: string, signature: string): boolean;
  verifyTransaction(reference: string): Promise<{ status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EXPIRED' }>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
