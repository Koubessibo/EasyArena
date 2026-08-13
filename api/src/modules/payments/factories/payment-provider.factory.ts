import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from '../interfaces/payment-provider.interface';
import { SamirpayProvider } from '../providers/samirpay.provider';
import { MockPaymentProvider } from '../providers/mock.provider';

export const PaymentProviderFactory = {
  provide: PAYMENT_PROVIDER,
  useFactory: (
    config: ConfigService,
    samirpay: SamirpayProvider,
    mock: MockPaymentProvider,
  ) => {
    return config.get<string>('payment.providerName') === 'samirpay' ? samirpay : mock;
  },
  inject: [ConfigService, SamirpayProvider, MockPaymentProvider],
};
