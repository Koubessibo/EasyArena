import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';

const EXPIRY_MINUTES = 30;

@Injectable()
export class OrderReconciliationService {
  private readonly logger = new Logger(OrderReconciliationService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async cleanupAbandonedOrders() {
    this.logger.log('[OrderReconciliation] Démarrage du nettoyage des commandes orphelines...');

    const threshold = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

    const abandonedOrders = await this.orderRepo.find({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        created_at: LessThanOrEqual(threshold),
      },
      relations: ['items'],
    });

    if (abandonedOrders.length === 0) {
      this.logger.log('[OrderReconciliation] Aucune commande orpheline > 30 min.');
      return { processed: 0, cancelled: 0, stockRestored: 0 };
    }

    this.logger.log(`[OrderReconciliation] ${abandonedOrders.length} commande(s) orpheline(s) à annuler.`);

    let cancelledCount = 0;
    let stockRestoredCount = 0;

    for (const order of abandonedOrders) {
      try {
        const restored = await this.cancelAndRestoreStock(order);
        cancelledCount++;
        stockRestoredCount += restored;
      } catch (err: any) {
        this.logger.error(`[OrderReconciliation] Erreur sur commande ${order.id}: ${err.message}`);
      }
    }

    this.logger.log(
      `[OrderReconciliation] Bilan : ${cancelledCount} commande(s) annulée(s), ${stockRestoredCount} unité(s) de stock restaurée(s).`,
    );
    return { processed: abandonedOrders.length, cancelled: cancelledCount, stockRestored: stockRestoredCount };
  }

  async cancelAndRestoreStock(order: Order): Promise<number> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let totalRestored = 0;

    try {
      await qr.manager.update(Order, order.id, { status: OrderStatus.CANCELLED });

      const items = order.items ?? await qr.manager.find(OrderItem, {
        where: { order_id: order.id },
      });

      for (const item of items) {
        await qr.manager
          .createQueryBuilder()
          .update(Product)
          .set({ stock_quantity: () => `stock_quantity + ${item.quantity}` })
          .where('id = :id', { id: item.product_id })
          .execute();

        totalRestored += item.quantity;
        this.logger.log(
          `  ↩️  Produit ${item.product_id} : +${item.quantity} unités restaurées`,
        );
      }

      await qr.commitTransaction();
      this.logger.log(`  ✅ Commande ${order.id} annulée — ${totalRestored} unité(s) restituée(s)`);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return totalRestored;
  }
}
