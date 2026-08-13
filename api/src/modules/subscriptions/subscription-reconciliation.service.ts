import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { PaymentInstallment } from './entities/payment-installment.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { InstallmentStatus, SubscriptionStatus } from '../../common/enums';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';

const GRACE_PERIOD_DAYS = 3;

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

    const relanceResult = await this.phase1Relance();
    const suspendResult = await this.phase2Suspension();

    this.logger.log(
      `[SubscriptionCron] Bilan — Relances: ${relanceResult.relanced}, Suspensions: ${suspendResult.suspended}`,
    );

    return { ...relanceResult, ...suspendResult };
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
}
