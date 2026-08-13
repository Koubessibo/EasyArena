import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IotService {
  private readonly logger = new Logger(IotService.name);

  async scheduleFieldLights(bookingId: string, fieldId: string, slotStartStr: string, slotEndStr: string, bookingDateStr: string) {
    this.logger.log(`[No-op] Would schedule lights for field ${fieldId}, booking ${bookingId}`);
  }
}
