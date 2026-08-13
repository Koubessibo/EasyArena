import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SubscriptionPlan, MoratoriumStep } from './entities/subscription-plan.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { PaymentInstallment } from './entities/payment-installment.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { SubscriptionStatus, InstallmentStatus } from '../../common/enums';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly dataSource: DataSource,
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

      // 2. Création de l'abonnement
      // Validité par défaut : 1 an par exemple. (À adapter selon les règles métier exactes)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);

      const subscription = manager.create(UserSubscription, {
        client_id: clientId,
        plan_id: plan.id,
        status: SubscriptionStatus.PENDING, // Changed to PENDING
        start_date: startDate,
        end_date: endDate,
      });

      const savedSubscription = await manager.save(subscription);

      // 3. Génération de l'échéancier financier
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

      // 4. Sauvegarde de l'échéancier
      const savedInstallments = await manager.save(installments);
      savedSubscription.installments = savedInstallments;

      let redirectUrl: string | undefined = undefined;
      let paymentUrls: any = undefined;
      
      const firstInstallment = savedInstallments[0];
      if (firstInstallment && Number(firstInstallment.amount) > 0) {
         const paymentResponse = await this.paymentProvider.initiatePayment({
             amount: Number(firstInstallment.amount),
             reference: firstInstallment.id,
             phone: paymentPhone || '',
             operator: (operator || 'WAVE') as any,
         });

         redirectUrl = paymentResponse.redirect_url;
         paymentUrls = paymentResponse.urls;
      }

      return {
        subscription: savedSubscription,
        redirect_url: redirectUrl,
        urls: paymentUrls
      };
    });
  }
}
