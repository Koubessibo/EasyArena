import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CashOutParams,
  CashOutResult,
  IPaymentProvider,
  InitiatePaymentParams,
  InitiatePaymentResult,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    this.logger.log(`[PAYMENT STUB] Initiated: ${params.reference}`);
    return {
      external_ref: `EXT-${params.reference}-${Date.now()}`,
      redirect_url: undefined,
      urls: undefined,
      qr_code: undefined,
    };
  }

  async cashOut(params: CashOutParams): Promise<CashOutResult> {
    this.logger.log(`[CASHOUT STUB] ${params.amount} FCFA → ${params.phoneNumber} (${params.operator})`);
    return {
      success: true,
      external_ref: `CASHOUT-${params.phoneNumber}-${Date.now()}`,
      message: 'Mock cashout successful',
    };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!signature) return false;
    const secret = process.env.SAMIRPAY_WEBHOOK_SECRET || 'mock-webhook-secret';
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  async verifyTransaction(reference: string): Promise<{ status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EXPIRED' }> {
    this.logger.log(`[VERIFY STUB] Verifying: ${reference}`);
    return { status: 'SUCCESS' };
  }
}
