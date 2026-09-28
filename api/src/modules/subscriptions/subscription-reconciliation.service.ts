import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentInstallment } from './entities/payment-installment.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { InstallmentStatus, NotificationPriority, NotificationType, SubscriptionStatus } from '../../common/enums';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';

const GRACE_PERIOD_DAYS = 3;

/**
 * BLOC 3 — Délai au-delà duquel une souscription `pending` est considérée
 * comme abandonnée (session Mobile Money expirée) et purge.
 */
const STALE_PENDING_MS = 30 * 60 * 1000;

@Injectable()
export class SubscriptionReconciliationService {
  private readonly logger = new Logger(SubscriptionReconciliationService.name);

  constructor(
    @InjectRepository(PaymentInstallment)
    private readonly installmentRepo: Repository<PaymentInstallment>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepo: Repository<UserSubscription>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processInstallments() {
    this.logger.log('[SubscriptionCron] Démarrage du recouvrement quotidien...');

    // Ordre : purge des abandonnés (libère le quota de souscriptions),
    // puis relance des actifs, puis suspension des défaillants.
    const purgeResult = await this.phase0Purge();
    const relanceResult = await this.phase1Relance();
    const suspendResult = await this.phase2Suspension();

    this.logger.log(
      `[SubscriptionCron] Bilan — Purgés: ${purgeResult.cancelled}, ` +
        `Relances: ${relanceResult.relanced}, Suspensions: ${suspendResult.suspended}`,
    );

    return { ...purgeResult, ...relanceResult, ...suspendResult };
  }

  /**
   * BLOC 3 — Purge des souscriptions `pending` abandonnées.
   *
   * `subscribeClient()` persiste la souscription **avant** d'ouvrir la session
   * de paiement : si le client abandonne, elle reste `pending` à vie.
   * `phase1Relance()` et `phase2Suspension()` n'agissent que sur `active`,
   * donc ces orphelines n'étaient jamais traitées — et sans le garde
   * anti-doublon de `subscribeClient()`, elles bloquaient une nouvelle
   * tentative sur le même plan.
   *
   * On les passe en `cancelled` et on stérilise leurs échéances (`failed`)
   * pour qu'aucun webhook tardif ne les rallume.
   *
   * Fenêtre de sécurité : le cron ne tourne qu'à minuit, une souscription
   * n'est donc purgée qu'après plusieurs heures d'inactivité — très au-delà
   * de la durée de vie d'une session Mobile Money. En complément, le même
   * contrôle est fait en ligne dans `subscribeClient()` (30 min) pour ne pas
   * obliger le client à attendre le lendemain.
   */
  async phase0Purge(): Promise<{ cancelled: number }> {
    this.logger.log('[Phase 0] Purge des souscriptions pending abandonnées...');

    // Horloge de la base plutôt que celle du process Node : `created_at` est un
    // `timestamp without time zone` écrit en UTC, et le lier à un `Date`
    // JavaScript dépend du fuseau horaire du process (un décalage de fuseau
    // rendait la fenêtre inopérante et la purge ne trouvait rien). `now()` et
    // `make_interval` comparent dans exactement le même référentiel que la
    // colonne, quel que soit le TZ de la machine.
    const { entities: stale, raw } = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SubscriptionStatus.PENDING })
      .andWhere('s.created_at < now() - make_interval(mins => :mins)', {
        mins: STALE_PENDING_MS / 60000,
      })
      .addSelect("EXTRACT(EPOCH FROM (now() - s.created_at)) / 60", 's_age_minutes')
      .getRawAndEntities();

    this.logger.log(`[Phase 0] ${stale.length} souscription(s) pending orpheline(s).`);

    let cancelled = 0;

    for (const sub of stale) {
      try {
        await this.subscriptionRepo.update(sub.id, {
          status: SubscriptionStatus.CANCELLED,
        });
        // Échéance vivante = session de paiement encore ouverte : on la ferme
        // pour que le webhook renvoie « Already processed » au lieu d'activer
        // une souscription que l'on vient d'abandonner.
        await this.installmentRepo.update(
          { subscription_id: sub.id, status: InstallmentStatus.PENDING },
          { status: InstallmentStatus.FAILED },
        );

        cancelled++;
        const age = Math.round(Number(raw.find(r => r.s_id === sub.id)?.s_age_minutes ?? 0));
        this.logger.log(
          `  🗑 Souscription ${sub.id.slice(0, 8)} annulée (pending depuis ${age} min)`,
        );
      } catch (err: any) {
        this.logger.error(`[Phase 0] Erreur sur souscription ${sub.id}: ${err.message}`);
      }
    }

    return { cancelled };
  }

  async phase1Relance(): Promise<{ relanced: number }> {
    this.logger.log('[Phase 1] Relance des échéances dues (J+0 à J+3)...');

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Échéances PENDING dont la due_date est entre J-3 et aujourd'hui inclus
    const dueInstallments = await this.installmentRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.subscription', 'sub')
      .leftJoinAndSelect('sub.client', 'client')
      .leftJoinAndSelect('client.user', 'user')
      .where('i.status = :status', { status: InstallmentStatus.PENDING })
      .andWhere('i.due_date <= :now', { now })
      .andWhere('i.due_date > :cutoff', { cutoff: threeDaysAgo })
      .getMany();

    this.logger.log(`[Phase 1] ${dueInstallments.length} échéance(s) à relancer.`);

    let relanced = 0;

    for (const installment of dueInstallments) {
      try {
        const sub = installment.subscription;
        if (!sub || sub.status !== SubscriptionStatus.ACTIVE) continue;

        const client = sub.client;
        const user = client?.user;
        if (!user?.phone) continue;

        // Generate payment link via provider
        let paymentUrl = '';
        try {
          const paymentRes = await this.paymentProvider.initiatePayment({
            amount: Number(installment.amount),
            reference: installment.id,
            phone: user.phone,
          });
          paymentUrl = paymentRes.redirect_url || paymentRes.urls?.OM || paymentRes.urls?.MAXIT || '';
        } catch (err: any) {
          this.logger.warn(`[Phase 1] Échec génération lien pour installment ${installment.id}: ${err.message}`);
        }

        // Send SMS reminder
        const linkPart = paymentUrl ? ` Réglez ici : ${paymentUrl}` : '';
        const msg = `EasyArena: Votre échéance de ${installment.amount} FCFA est due aujourd'hui. Réglez pour maintenir votre accès.${linkPart}`;

        await this.notificationsService.sendSms(user.id, user.phone, msg);
        await this.notifySubscriptionDue(user, installment, paymentUrl);
        relanced++;

        this.logger.log(
          `  📩 Relance envoyée — installment=${installment.id.slice(0, 8)} client=${user.phone} montant=${installment.amount}`,
        );
      } catch (err: any) {
        this.logger.error(`[Phase 1] Erreur sur installment ${installment.id}: ${err.message}`);
      }
    }

    return { relanced };
  }

  async phase2Suspension(): Promise<{ suspended: number }> {
    this.logger.log('[Phase 2] Suspension des abonnements en défaut (> 3 jours)...');

    const now = new Date();
    const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Échéances PENDING dont la due_date est dépassée de plus de 3 jours
    const overdueInstallments = await this.installmentRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.subscription', 'sub')
      .leftJoinAndSelect('sub.client', 'client')
      .leftJoinAndSelect('client.user', 'user')
      .where('i.status = :status', { status: InstallmentStatus.PENDING })
      .andWhere('i.due_date <= :cutoff', { cutoff })
      .getMany();

    this.logger.log(`[Phase 2] ${overdueInstallments.length} échéance(s) en défaut > 3 jours.`);

    let suspended = 0;
    const processedSubscriptions = new Set<string>();

    for (const installment of overdueInstallments) {
      try {
        const sub = installment.subscription;
        if (!sub || sub.status !== SubscriptionStatus.ACTIVE) continue;
        if (processedSubscriptions.has(sub.id)) continue;

        processedSubscriptions.add(sub.id);

        // Mark installment as OVERDUE
        await this.installmentRepo.update(installment.id, { status: InstallmentStatus.OVERDUE });

        // Suspend the subscription
        await this.subscriptionRepo.update(sub.id, { status: SubscriptionStatus.SUSPENDED });

        // Notify the client
        const user = sub.client?.user;
        if (user?.phone) {
          const msg = `EasyArena: Votre abonnement a été suspendu pour défaut de paiement. Réglez vos échéances pour réactiver votre accès.`;
          await this.notificationsService.sendSms(user.id, user.phone, msg);
          await this.notifySubscriptionSuspended(user, sub);
        }

        suspended++;
        this.logger.log(
          `  ⛔ Abonnement ${sub.id.slice(0, 8)} SUSPENDU — échéance ${installment.id.slice(0, 8)} impayée depuis > 3 jours`,
        );
      } catch (err: any) {
        this.logger.error(`[Phase 2] Erreur sur installment ${installment.id}: ${err.message}`);
      }
    }

    return { suspended };
  }

  // ════════════════════════════════════════════════════════════════════
  //  IN-APP (Phase 3) — même destinataire que le SMS, canal distinct
  // ════════════════════════════════════════════════════════════════════

  /**
   * Relance d'échéance. La clé porte la date du jour : le cron tourne tous
   * les matins sur la même échéance, il ne faut ni perdre les relances
   * suivantes, ni double-déclencher si le job tourne deux fois.
   */
  private async notifySubscriptionDue(
    user: User,
    installment: PaymentInstallment,
    paymentUrl: string,
  ): Promise<void> {
    await this.notificationsService.notify({
      userId: user.id,
      type: NotificationType.SUBSCRIPTION_DUE,
      title: 'Échéance à régler',
      message: `Votre échéance de ${installment.amount} FCFA est due aujourd'hui. Réglez pour maintenir votre accès.`,
      link: '/my-subscriptions',
      metadata: {
        installmentId: installment.id,
        subscriptionId: installment.subscription_id,
        amount: Number(installment.amount),
        ...(paymentUrl ? { paymentUrl } : {}),
      },
      priority: NotificationPriority.INFO,
      dedupeKey: `subscription:${installment.id}:due:${new Date()
        .toISOString()
        .slice(0, 10)}`,
    });
  }

  /** Abonnement suspendu : l'accès est coupé, l'utilisateur doit agir. */
  private async notifySubscriptionSuspended(
    user: User,
    sub: UserSubscription,
  ): Promise<void> {
    await this.notificationsService.notify({
      userId: user.id,
      type: NotificationType.SUBSCRIPTION_SUSPENDED,
      title: 'Abonnement suspendu',
      message:
        'Votre abonnement a été suspendu pour défaut de paiement. ' +
        'Réglez vos échéances pour réactiver votre accès.',
      link: '/my-subscriptions',
      metadata: { subscriptionId: sub.id },
      priority: NotificationPriority.ACTION,
      dedupeKey: `subscription:${sub.id}:suspended`,
    });
  }
}
