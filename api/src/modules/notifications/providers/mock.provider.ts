import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

@Injectable()
export class MockSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  async send(phone: string, message: string): Promise<void> {
    this.logger.log(`[SMS STUB] → ${phone}: ${message}`);
  }
}
