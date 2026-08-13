import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from '../interfaces/sms-provider.interface';
import { MTargetProvider } from '../providers/mtarget.provider';
import { MockSmsProvider } from '../providers/mock.provider';

export const SmsProviderFactory = {
  provide: SMS_PROVIDER,
  useFactory: (
    config: ConfigService,
    mtarget: MTargetProvider,
    mock: MockSmsProvider,
  ) => {
    return config.get<string>('sms.providerName') === 'mtarget' ? mtarget : mock;
  },
  inject: [ConfigService, MTargetProvider, MockSmsProvider],
};
