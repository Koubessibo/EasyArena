import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { ISmsProvider, SMS_PROVIDER } from './interfaces/sms-provider.interface';
import { NotificationChannel, NotificationStatus } from '../../common/enums';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @Inject(SMS_PROVIDER)
    private readonly smsProvider: ISmsProvider,
  ) {}

  async sendSms(userId: string, phone: string, message: string): Promise<void> {
    let status = NotificationStatus.SENT;
    try {
      await this.smsProvider.send(phone, message);
    } catch (err) {
      this.logger.error(`SMS failed to ${phone}: ${(err as Error).message}`);
      status = NotificationStatus.FAILED;
    }
    await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: userId,
        channel: NotificationChannel.SMS,
        message,
        status,
      }),
    );
  }

  async sendRawSms(phone: string, message: string): Promise<void> {
    try {
      await this.smsProvider.send(phone, message);
    } catch (err) {
      this.logger.error(`SMS failed to ${phone}: ${(err as Error).message}`);
    }
  }

  async sendEmail(
    userId: string,
    subject: string,
    message: string,
  ): Promise<void> {
    this.logger.log(`[EMAIL STUB] To user ${userId} | Subject: ${subject} | ${message}`);
    await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: userId,
        channel: NotificationChannel.EMAIL,
        subject,
        message,
        status: NotificationStatus.SENT,
      }),
    );
  }

  async getUserNotifications(
    userId: string,
    page = 1,
    perPage = 20,
  ): Promise<{ data: Notification[]; total: number }> {
    const [data, total] = await this.notificationRepo.findAndCount({
      where: { user_id: userId },
      order: { sent_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { data, total };
  }

  async markAsRead(userId: string, notifId: string): Promise<Notification> {
    const notif = await this.notificationRepo.findOneOrFail({
      where: { id: notifId, user_id: userId },
    });
    notif.is_read = true;
    return this.notificationRepo.save(notif);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepo.update({ user_id: userId, is_read: false }, { is_read: true });
  }
}
