import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOperator, FindOptionsWhere, In, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import {
  ISmsProvider,
  SMS_PROVIDER,
} from './interfaces/sms-provider.interface';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
} from '../../common/enums';

/** Entrée d'une notification in-app à créer. */
export interface NotifyInput {
  /** Destinataire final (un seul : chaque notification appartient à un user). */
  userId: string;
  type: NotificationType;
  /** Titre court affiché en gras (150 car. max). */
  title: string;
  message: string;
  /** Route Angular ouverte au clic, ex: '/owner/bookings'. */
  link?: string;
  /** Contexte structuré : { bookingId, amount, fieldId, ... }. */
  metadata?: Record<string, unknown>;
  /** Défaut: INFO. 'action' => badge rouge + toast persistant. */
  priority?: NotificationPriority;
  /**
   * Idempotence. Ex: `withdrawal:{id}:approved`.
   * Deuxième appel avec la même clé est ignoré (cron/webhook rejoué).
   * Le service suffixe automatiquement par `userId` : l'index unique est
   * global, sans ce suffixe le destinataire suivant serait écrasé.
   */
  dedupeKey?: string;
}

export interface ListNotificationsQuery {
  page?: number;
  perPage?: number;
  /**
   * Filtre de type : une liste de critères séparés par des virgules, chacun
   * étant un type exact (`booking_confirmed`) **ou** un préfixe thématique se
   * terminant par `_` (`booking_`). Ex: `booking_,cancellation_`.
   * Le préfixe est résolu en liste de types côté serveur pour rester
   * compatible avec la pagination.
   */
  type?: string;
  unreadOnly?: boolean;
}

export interface ListNotificationsResult {
  data: Notification[];
  total: number;
  unread: number;
}

const MAX_TITLE = 150;
const MAX_LINK = 255;
const MAX_DEDUPE_KEY = 191;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @Inject(SMS_PROVIDER)
    private readonly smsProvider: ISmsProvider,
    private readonly gateway: NotificationsGateway,
  ) {}

  // ══════════════════════════════════════════════════════════════════════
  //  IN-APP — point d'entrée unique
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Crée une notification in-app et la pousse en temps réel.
   *
   * Ordre strict : PERSISTANCE puis émission. Si le WebSocket tombe, la
   * notification reste lisible au prochain fetch — jamais l'inverse.
   *
   * Ne JAMAIS throw : une notification qui échoue ne doit pas faire échouer
   * le paiement / la réservation qui l'a déclenchée.
   *
   * @returns la notification créée, ou null si ignorée (doublon ou échec).
   */
  async notify(input: NotifyInput): Promise<Notification | null> {
    const dedupeKey = this.scopedDedupeKey(input.dedupeKey, input.userId);

    if (dedupeKey && (await this.findDeduped(dedupeKey))) {
      this.logger.debug(`notify() ignoré (doublon): ${dedupeKey}`);
      return null;
    }

    try {
      const saved = await this.notificationRepo.save(
        this.notificationRepo.create({
          user_id: input.userId,
          channel: NotificationChannel.IN_APP,
          type: input.type,
          title: input.title?.slice(0, MAX_TITLE) ?? null,
          message: input.message,
          link: input.link?.slice(0, MAX_LINK) ?? null,
          metadata: input.metadata ?? null,
          priority: input.priority ?? NotificationPriority.INFO,
          dedupe_key: dedupeKey,
          status: NotificationStatus.SENT,
          is_read: false,
          read_at: null,
        }),
      );

      this.gateway.emitNew(saved);
      return saved;
    } catch (err) {
      // Course insérée : deux instances ont inséré la même dedupe_key.
      if (this.isUniqueViolation(err)) {
        this.logger.debug(`notify() ignoré (course): ${dedupeKey ?? ''}`);
        return null;
      }
      this.logger.error(
        `notify() a échoué pour ${input.userId} [${input.type}]: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Diffuse la même notification à plusieurs destinataires.
   * Un destinataire en échec n'interrompt pas les autres.
   */
  async notifyMany(
    userIds: string[],
    input: Omit<NotifyInput, 'userId'>,
  ): Promise<number> {
    const targets = [...new Set(userIds)].filter(Boolean);
    if (targets.length === 0) return 0;

    const results = await Promise.all(
      targets.map((userId) => this.notify({ ...input, userId })),
    );
    return results.filter(Boolean).length;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  IN-APP — lecture
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Pagine le fil in-app. Le journal SMS/email en est explicitement exclu :
   * seules les notifications applicatives sont montrées à l'utilisateur.
   */
  async getUserNotifications(
    userId: string,
    query: ListNotificationsQuery = {},
  ): Promise<ListNotificationsResult> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 20, 1), 100);
    const typeFilter = this.resolveTypeFilter(query.type);

    const where: FindOptionsWhere<Notification> = {
      user_id: userId,
      channel: NotificationChannel.IN_APP,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(query.unreadOnly ? { is_read: false } : {}),
    };

    const [data, total, unread] = await Promise.all([
      this.notificationRepo.find({
        where,
        order: { sent_at: 'DESC' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.notificationRepo.count({ where }),
      this.getUnreadCount(userId),
    ]);

    return { data, total, unread };
  }

  /** Compteur des non-lus, servi aux badges. */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: {
        user_id: userId,
        channel: NotificationChannel.IN_APP,
        is_read: false,
      },
    });
  }

  /** Marque une notification comme lue et synchronise les autres devices. */
  async markAsRead(
    userId: string,
    notifId: string,
  ): Promise<Notification | null> {
    const notif = await this.notificationRepo.findOne({
      where: {
        id: notifId,
        user_id: userId,
        channel: NotificationChannel.IN_APP,
      },
    });
    if (!notif) return null;
    if (notif.is_read) return notif;

    notif.is_read = true;
    notif.read_at = new Date();
    const saved = await this.notificationRepo.save(notif);

    this.gateway.emitRead(
      userId,
      [saved.id],
      await this.getUnreadCount(userId),
    );
    return saved;
  }

  /** Marque tout comme lu et synchronise les autres devices. */
  async markAllRead(userId: string): Promise<{ unread: 0 }> {
    const unread = await this.getUnreadCount(userId);
    if (unread > 0) {
      await this.notificationRepo.update(
        {
          user_id: userId,
          channel: NotificationChannel.IN_APP,
          is_read: false,
        },
        { is_read: true, read_at: new Date() },
      );
      this.gateway.emitUnread(userId, 0);
    }
    return { unread: 0 };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SMS / EMAIL — journal d'envois (inchangé, audit uniquement)
  // ══════════════════════════════════════════════════════════════════════

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
        // Le journal SMS n'a pas de typologie métier : valeur neutre.
        type: NotificationType.SYSTEM_ALERT,
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
    this.logger.log(
      `[EMAIL STUB] To user ${userId} | Subject: ${subject} | ${message}`,
    );
    await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: userId,
        channel: NotificationChannel.EMAIL,
        type: NotificationType.SYSTEM_ALERT,
        subject,
        message,
        status: NotificationStatus.SENT,
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Privées
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Qualifie la clé d'idempotence par son destinataire.
   *
   * `uq_notifications_dedupe_key` est un index **global** : sans ce suffixe,
   * la deuxième cible d'un `notifyMany()` serait silencieusement écrasée par
   * la première. Avec le suffixe, la clé garantit exactement :
   * « au plus une notification pour tel événement, chez tel utilisateur ».
   */
  private scopedDedupeKey(
    key: string | undefined,
    userId: string,
  ): string | null {
    if (!key) return null;
    const suffix = `:${userId}`;
    return key.slice(0, Math.max(MAX_DEDUPE_KEY - suffix.length, 0)) + suffix;
  }

  /**
   * Traduit le paramètre `type` en contrainte TypeORM.
   *
   * Plusieurs critères sont acceptés, séparés par des virgules, chacun étant
   * soit un type exact (`booking_confirmed`), soit un préfixe thématique
   * se terminant par `_` (`booking_`) :
   *
   *   `booking_,cancellation_` → toutes les réservations et annulations
   *
   * Les critères vides ou inconnus sont ignorés (filtre absent plutôt
   * qu'erreur 500) — le DTO a déjà écarté le cas en aval.
   */
  private resolveTypeFilter(
    filter?: string,
  ): NotificationType | FindOperator<NotificationType> | undefined {
    if (!filter) return undefined;

    const known = Object.values(NotificationType) as string[];
    const matched = new Set<string>();

    for (const raw of filter.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      if (known.includes(part)) {
        matched.add(part);
      } else if (part.endsWith('_')) {
        known.filter((v) => v.startsWith(part)).forEach((v) => matched.add(v));
      }
    }

    if (matched.size === 0) return undefined;
    const list = [...matched] as NotificationType[];
    return list.length === 1 ? list[0] : In(list);
  }

  private async findDeduped(dedupeKey: string): Promise<boolean> {
    const found = await this.notificationRepo
      .createQueryBuilder('n')
      .select('1', 'one')
      .where('n.dedupe_key = :key', { key: dedupeKey })
      .getRawOne<Record<string, unknown>>();
    return Boolean(found);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code =
      (err as { code?: string })?.code ??
      (err as { driverError?: { code?: string } })?.driverError?.code;
    return code === '23505';
  }
}
