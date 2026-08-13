import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

interface MTargetResponse {
  results: Array<{ msisdn: string; reason: string }>;
}

@Injectable()
export class MTargetProvider implements ISmsProvider {
  private readonly logger = new Logger(MTargetProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async send(phone: string, message: string): Promise<void> {
    const username  = this.configService.get<string>('sms.mtarget.username')!;
    const password  = this.configService.get<string>('sms.mtarget.password')!;
    const serviceId = this.configService.get<string>('sms.mtarget.serviceId')!;
    const sender    = this.configService.get<string>('sms.mtarget.sender') ?? 'XEWEUL';

    let cleanPhone = phone.replace(/\s+/g, '').replace(/-/g, '');
    if (cleanPhone.startsWith('+')) {
      cleanPhone = '00' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('221')) {
      cleanPhone = '00' + cleanPhone;
    } else if (!cleanPhone.startsWith('00') && cleanPhone.length === 9) {
      cleanPhone = '00221' + cleanPhone;
    }

    const msisdn = cleanPhone;

    const params = new URLSearchParams({
      username,
      password,
      msisdn,
      sender,
      serviceid: serviceId,
      msg: message,
    });

    const response = await fetch('https://api-public-2.mtarget.fr/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`MTarget HTTP error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as MTargetResponse;
    const reason = data.results?.[0]?.reason;

    if (reason !== 'ACCEPTED') {
      throw new Error(`MTarget rejected SMS to ${phone}: ${reason}`);
    }

    this.logger.log(`[MTarget] SMS delivered to ${phone}`);
  }
}
