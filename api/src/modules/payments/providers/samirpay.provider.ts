import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CashOutParams,
  CashOutResult,
  IPaymentProvider,
  InitiatePaymentParams,
  InitiatePaymentResult,
} from '../interfaces/payment-provider.interface';

const CASHIN_URL = 'https://app.samirpay.com/samirpays/api/tiers/direct/initPayment';
const CASHOUT_URL = 'https://app.samirpay.com/samirpays/api/tiers/payments/send';

interface SamirpayCashInResponse {
  success: boolean;
  data: {
    url: string;
    transactionId: string;
    urls: { OM?: string; MAXIT?: string } | null;
    qrCode: string | null;
  };
}

interface SamirpayCashOutResponse {
  status: string;
  message: string;
  body: {
    id: string;
    reference: string;
    operatorName: string;
    operationDate: string;
    status: string;
    type: string;
    origin: string;
    telephone: string;
    amount: number;
    netAmount: number;
    fees: number;
    refOperator: string;
  };
}

@Injectable()
export class SamirpayProvider implements IPaymentProvider {
  private readonly logger = new Logger(SamirpayProvider.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('payment.samirpay.apiKey')!;
    this.secretKey = this.configService.get<string>('payment.samirpay.secretKey')!;
    this.webhookSecret = this.configService.get<string>('payment.samirpay.webhookSecret') ?? this.secretKey;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey,
      'X-SECRET-KEY': this.secretKey,
    };
  }

  private normalizeOperator(operator?: string): string {
    if (!operator) return 'WAVE';
    const op = operator.toUpperCase().trim();
    if (op === 'OM' || op === 'ORANGE' || op === 'ORANGE_MONEY') return 'ORANGE_MONEY';
    return op;
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const operatorName = this.normalizeOperator(params.operator as string);
    const returnUrl = params.returnUrl || params.callbackUrl || 'http://localhost:4200/my-tickets?status=success';

    let cleanPhone = params.phone ? params.phone.replace(/[\s\-().]/g, '') : '';
    if (cleanPhone.startsWith('+221')) cleanPhone = cleanPhone.slice(4);
    else if (cleanPhone.startsWith('00221')) cleanPhone = cleanPhone.slice(5);
    else if (cleanPhone.startsWith('221') && cleanPhone.length >= 12) cleanPhone = cleanPhone.slice(3);
    if (!cleanPhone) cleanPhone = '773780756';

    const fullIntlPhone = `+221${cleanPhone}`;

    const body = {
      amount: String(params.amount),
      operatorName: operatorName,
      orderId: params.reference,
      phone: fullIntlPhone,
      phoneNumber: cleanPhone,
      telephone: fullIntlPhone,
      customerPhone: fullIntlPhone,
      callbackUrl: returnUrl,
      returnUrl: returnUrl,
      urlCallback: returnUrl,
      urlSuccess: returnUrl,
    };

    this.logger.log(`[CashIn] orderId=${params.reference} operator=${operatorName} amount=${params.amount} phone=${fullIntlPhone} returnUrl=${returnUrl}`);

    const response = await fetch(CASHIN_URL, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`[CashIn] Failed (${response.status}): ${errorText}`);
      throw new InternalServerErrorException(`Samirpay initPayment failed: ${response.status}`);
    }

    const data = (await response.json()) as SamirpayCashInResponse;

    const redirectUrl =
      data.data.url ||
      data.data.urls?.OM ||
      data.data.urls?.MAXIT ||
      (data.data.urls ? Object.values(data.data.urls)[0] : undefined);

    return {
      external_ref: data.data.transactionId,
      redirect_url: redirectUrl || undefined,
      urls: data.data.urls ?? undefined,
      qr_code: data.data.qrCode ?? undefined,
    };
  }

  private normalizePhone(phone: string): string {
    let p = phone.replace(/[\s\-().]/g, '');
    if (p.startsWith('+221')) return p.slice(4);
    if (p.startsWith('00221')) return p.slice(5);
    if (p.startsWith('221') && p.length >= 12) return p.slice(3);
    return p;
  }

  async cashOut(params: CashOutParams): Promise<CashOutResult> {
    const phone = this.normalizePhone(params.phoneNumber);
    const operatorName = this.normalizeOperator(params.operator as string);
    const body = {
      phoneNumber: phone,
      operatorName: operatorName,
      amount: Math.round(Number(params.amount)),
    };

    this.logger.log(`[CashOut] ${params.amount} FCFA → ${phone} (${operatorName})`);

    const response = await fetch(CASHOUT_URL, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`[CashOut] Failed (${response.status}): ${errorText}`);
      return { success: false, message: `${response.status}: ${errorText}` };
    }

    const data = (await response.json()) as SamirpayCashOutResponse;

    return {
      success: data.status === 'success',
      external_ref: data.body?.id,
      message: data.message,
    };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!signature) {
      this.logger.warn('[Webhook] Rejected: missing x-signature header');
      return false;
    }
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) {
      this.logger.warn('[Webhook] Rejected: signature length mismatch');
      return false;
    }
    const valid = timingSafeEqual(sigBuffer, expectedBuffer);
    if (!valid) {
      this.logger.warn('[Webhook] Rejected: HMAC signature invalid');
    }
    return valid;
  }

  async verifyTransaction(reference: string): Promise<{ status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EXPIRED' }> {
    const url = `https://app.samirpay.com/samirpays/api/tiers/direct/verify/${reference}`;
    this.logger.log(`[VerifyTransaction] Querying Samirpay for reference=${reference}`);
    try {
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      if (!response.ok) return { status: 'FAILED' };
      const data: any = await response.json();
      const statusStr = String(data.status || data.data?.status || '').toUpperCase();
      if (statusStr === 'SUCCESS' || statusStr === 'SUCCESSFUL' || statusStr === 'PAID') return { status: 'SUCCESS' };
      if (statusStr === 'FAILED' || statusStr === 'REJECTED') return { status: 'FAILED' };
      if (statusStr === 'EXPIRED') return { status: 'EXPIRED' };
      return { status: 'PENDING' };
    } catch (err: any) {
      this.logger.error(`[VerifyTransaction] Error querying Samirpay: ${err.message}`);
      return { status: 'PENDING' };
    }
  }
}
