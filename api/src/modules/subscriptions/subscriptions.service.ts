import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SubscriptionPlan, MoratoriumStep } from './entities/subscription-plan.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { PaymentInstallment } from './entities/payment-installment.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { MobileOperator, SubscriptionStatus, InstallmentStatus } from '../../common/enums';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';

/**
 * Une souscription `pending` plus vieille que ce délai a une session de
 * paiement morte : on la stérilise pour libérer une nouvelle tentative.
 * Repris tel quel par le cron quotidien (BLOC 3).
 */
const STALE_PENDING_MS = 30 * 60 * 1000;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
  ) {}

  /**
   * Crée un nouveau plan d'abonnement pour un propriétaire
   */
  async createPlan(dto: CreatePlanDto, ownerId: string): Promise<SubscriptionPlan> {
    // Vérification basique si le moratoire est activé mais aucune config n'est fournie
    if (dto.allows_moratorium && (!dto.moratorium_config || dto.moratorium_config.length === 0)) {
      throw new BadRequestException('moratorium_config is required when allows_moratorium is true');
    }

    // Validation des pourcentages si moratoire activé
    if (dto.allows_moratorium && dto.moratorium_config) {
      const totalPercentage = dto.moratorium_config.reduce((sum, step) => sum + step.percentage, 0);
      if (totalPercentage !== 100) {
        throw new BadRequestException('The sum of moratorium percentages must be exactly 100');
      }
    }

    const plan = this.planRepo.create({
      owner_id: ownerId,
      name: dto.name,
      price: dto.price,
      reservations_count: dto.reservations_count,
      duration_days: dto.duration_days ?? 30,
      allows_moratorium: dto.allows_moratorium,
      moratorium_config: dto.moratorium_config as MoratoriumStep[],
    });

    return this.planRepo.save(plan);
  }

  /**
   * Récupère les plans d'abonnement d'un propriétaire spécifique
   */
  async getPlansForOwner(ownerId: string): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { owner_id: ownerId },
      relations: ['owner'],
      order: { price: 'ASC' },
    });
  }

  async getAllPlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      relations: ['owner'],
      order: { price: 'ASC' },
    });
  }

  async updatePlan(id: string, dto: Partial<CreatePlanDto>, ownerId: string): Promise<SubscriptionPlan> {
    const plan = await this.planRepo.findOne({ where: { id, owner_id: ownerId } });
    if (!plan) {
      throw new NotFoundException('Plan d\'abonnement introuvable ou non autorisé');
    }

    if (dto.allows_moratorium && dto.moratorium_config) {
      const totalPercentage = dto.moratorium_config.reduce((sum, step) => sum + step.percentage, 0);
      if (totalPercentage !== 100) {
        throw new BadRequestException('La somme des pourcentages du moratoire doit être égale à 100%');
      }
    }

    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async deletePlan(id: string, ownerId: string): Promise<{ success: boolean }> {
    const res = await this.planRepo.delete({ id, owner_id: ownerId });
    if (res.affected === 0) {
      throw new NotFoundException('Plan d\'abonnement introuvable ou non autorisé');
    }
    return { success: true };
  }

  async getClientSubscriptions(clientId: string): Promise<UserSubscription[]> {
    return this.dataSource.getRepository(UserSubscription).find({
      where: { client_id: clientId },
      relations: ['plan', 'plan.owner', 'installments'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Souscrit un client à un plan avec génération automatique de l'échéancier (Transaction sécurisée)
   */
  async subscribeClient(planId: string, clientId: string, paymentPhone?: string, operator?: string): Promise<{ subscription: UserSubscription; redirect_url?: string; urls?: any }> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Récupération du plan et vérification
      const plan = await manager.findOne(SubscriptionPlan, { where: { id: planId } });
      if (!plan) {
        throw new NotFoundException(`SubscriptionPlan with id ${planId} not found`);
      }

      // 2. Anti-doublon (BLOC 3) — refuse ou recycle l'antécédent
      await this.guardAgainstDuplicate(manager, plan, clientId);

      // 3. Création de l'abonnement — validité portée par la formule
      //    (`+1 an` codé en dur ignorait totalement la durée du pass)
      const startDate = new Date();
      const endDate = new Date(startDate.getTime());
      endDate.setDate(endDate.getDate() + (plan.duration_days ?? 30));

      const subscription = manager.create(UserSubscription, {
        client_id: clientId,
        plan_id: plan.id,
        status: SubscriptionStatus.PENDING, // Changed to PENDING
        start_date: startDate,
        end_date: endDate,
      });

      const savedSubscription = await manager.save(subscription);

      // 4. Génération de l'échéancier financier
      const installments: PaymentInstallment[] = [];
      const planPrice = Number(plan.price);

      if (plan.allows_moratorium && plan.moratorium_config && plan.moratorium_config.length > 0) {
        // Moratoire activé : on itère sur la configuration
        for (const step of plan.moratorium_config) {
          const amount = (planPrice * step.percentage) / 100;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + step.daysAfter);

          installments.push(
            manager.create(PaymentInstallment, {
              subscription_id: savedSubscription.id,
              amount: Number(amount.toFixed(2)),
              due_date: dueDate,
              status: InstallmentStatus.PENDING,
            })
          );
        }
      } else {
        // Paiement cash (100% à J+0)
        installments.push(
          manager.create(PaymentInstallment, {
            subscription_id: savedSubscription.id,
            amount: planPrice,
            due_date: new Date(),
            status: InstallmentStatus.PENDING,
          })
        );
      }

      // 5. Sauvegarde de l'échéancier
      const savedInstallments = await manager.save(installments);
      savedSubscription.installments = savedInstallments;

      let redirectUrl: string | undefined = undefined;
      let paymentUrls: { OM?: string; MAXIT?: string } | undefined = undefined;

      const firstInstallment = savedInstallments[0];
      if (firstInstallment && Number(firstInstallment.amount) > 0) {
        // BLOC 2 — Retour de passerelle : après paiement, on dépose le client
        // sur « Mes Abonnements » (badge ACTIF) et non sur /my-bookings,
        // qui liste les réservations classiques.
        const frontendUrl =
          this.configService.get<string>('frontendUrl') ||
          process.env.FRONTEND_URL ||
          process.env.CLIENT_APP_URL ||
          'https://easyarena221.com';

        const paymentResponse = await this.paymentProvider.initiatePayment({
          amount: Number(firstInstallment.amount),
          reference: firstInstallment.id,
          phone: paymentPhone || '',
          operator: this.resolveOperator(operator),
          returnUrl: `${frontendUrl}/my-subscriptions?status=success`,
          callbackUrl: `${frontendUrl}/my-subscriptions?status=success`,
        });

        redirectUrl = paymentResponse.redirect_url;
        paymentUrls = paymentResponse.urls;
      }

      return {
        subscription: savedSubscription,
        redirect_url: redirectUrl,
        urls: paymentUrls,
      };
    });
  }

  /**
   * Anti-doublon (BLOC 3).
   *
   * `subscribeClient()` ne vérifiait rien : un rechargement de page ou un
   * second clic créait un nouvel échéancier **et** déclenchait un second
   * paiement, l'UI ne protégeant que localement via `subscribingId`.
   *
   * - `active` avec du quota restant -> refus : le pass est déjà consommé ;
   * - `active` sans quota restant    -> clôturé en `completed`, on autorise
   *                                     une nouvelle souscription ;
   * - `pending` récent (< 30 min)    -> refus : la session de paiement est
   *                                     encore vivante, on laisse finir ;
   * - `pending` stale (>= 30 min)    -> annulé (échéances -> `failed`) et on
   *                                     laisse refaire.
   *
   * La suppression du `pending` stale est aussi faite par le cron quotidien ;
   * ici on évite simplement d'obliger le client à attendre minuit.
   */
  private async guardAgainstDuplicate(
    manager: EntityManager,
    plan: SubscriptionPlan,
    clientId: string,
  ): Promise<void> {
    const existing = await manager.find(UserSubscription, {
      where: {
        client_id: clientId,
        plan_id: plan.id,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING]),
      },
    });

    for (const sub of existing) {
      if (sub.status === SubscriptionStatus.ACTIVE) {
        const remaining = plan.reservations_count - (sub.reservations_used ?? 0);
        if (remaining > 0) {
          throw new BadRequestException('Vous êtes déjà abonné(e) à cette formule.');
        }
        // Quota épuisé sans clôture : on archive puis on autorise un nouveau pass.
        await manager.update(UserSubscription, sub.id, {
          status: SubscriptionStatus.COMPLETED,
        });
        continue;
      }

      const age = Date.now() - new Date(sub.created_at).getTime();
      if (age < STALE_PENDING_MS) {
        throw new BadRequestException(
          'Une souscription est en attente de paiement pour cette formule. ' +
            'Finalisez-la ou réessayez dans quelques minutes.',
        );
      }

      await manager.update(UserSubscription, sub.id, {
        status: SubscriptionStatus.CANCELLED,
      });
      await manager.update(
        PaymentInstallment,
        { subscription_id: sub.id, status: InstallmentStatus.PENDING },
        { status: InstallmentStatus.FAILED },
      );
    }
  }

  /**
   * Le front propose `WAVE | OM`, or `OM` n'existe pas dans `MobileOperator`
   * (qui attend `ORANGE_MONEY`). On normalise ici plutôt que de forcer le
   * typage : `SamirpayProvider.normalizeOperator()` ferait le même travail,
   * mais sans this paramètre mal typé au passage.
   */
  private resolveOperator(operator?: string): MobileOperator {
    const op = (operator || 'WAVE').toUpperCase();
    if (op === 'OM' || op === 'ORANGE' || op === 'ORANGE_MONEY') {
      return MobileOperator.ORANGE_MONEY;
    }
    if (op === 'FREE_MONEY') return MobileOperator.FREE_MONEY;
    return MobileOperator.WAVE;
  }
}
