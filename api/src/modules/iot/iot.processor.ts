import { Processor, Process, OnQueueFailed, OnQueueActive, OnQueueCompleted } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('iot-commands')
export class IotProcessor {
  private readonly logger = new Logger(IotProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Process('turn_on')
  async handleTurnOn(job: Job<{ bookingId: string; fieldId: string; command: string }>) {
    this.logger.debug(`Processing turn_on job ${job.id} (Attempt ${job.attemptsMade + 1}/${job.opts.attempts}) for field ${job.data.fieldId}`);
    
    // Simulate network call to IoT relay...
    // MOCK: We throw an error to simulate network failure to demonstrate Retry Logic
    throw new Error('IoT API Timeout: Relay did not respond');
  }

  @Process('turn_off')
  async handleTurnOff(job: Job<{ bookingId: string; fieldId: string; command: string }>) {
    this.logger.debug(`Processing turn_off job ${job.id} (Attempt ${job.attemptsMade + 1}/${job.opts.attempts}) for field ${job.data.fieldId}`);
    
    // Simulate network call to IoT relay...
    // MOCK: We throw an error to simulate network failure to demonstrate Retry Logic
    throw new Error('IoT API Timeout: Relay did not respond');
  }

  @OnQueueFailed()
  async onFailed(job: Job, err: Error) {
    this.logger.warn(`Job ${job.id} failed with error: ${err.message}. Attempt ${job.attemptsMade}/${job.opts.attempts}`);
    
    // Check if definitive failure (all attempts exhausted)
    if (job.attemptsMade === job.opts.attempts) {
      this.logger.error(`\n🚨 CRITICAL_ALERT 🚨: IoT command definitive failure for job ${job.id} (Field ${job.data.fieldId}). Relay is unreachable after ${job.opts.attempts} attempts!`);
      
      // Notify the owner so they can turn it on manually
      try {
        // We mock the notification for the test
        this.logger.error(`[MOCK SMS] 📱 "Alerte: Impossible d'allumer le terrain ${job.data.fieldId}. Veuillez l'allumer manuellement pour la réservation ${job.data.bookingId}."`);
        // Actual notification service would be called here if we had the owner's phone number
      } catch (e) {
        this.logger.error('Failed to send fallback notification', e);
      }
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    // Only log if we want to trace when a job starts
  }
}
