import { BadRequestException, Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';

function generateReference(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `EA-${year}-${rand}`;
}

import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPriority, NotificationType } from '../../common/enums';
import { Client } from '../users/entities/client.entity';
import { Vendor } from '../users/entities/vendor.entity';

/** Seuil d'alerte de stock : déclenché à la traversée, pas à chaque vente. */
const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
    private readonly notificationsService: NotificationsService,
  ) {}

  async checkout(clientId: string, dto: CheckoutDto): Promise<{ orders: Order[]; reference: string; message: string; redirect_url?: string; urls?: any; status: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let redirectUrl: string | undefined = undefined;
    let paymentUrls: any = undefined;

    try {
      const productIds = dto.cartItems.map(item => item.productId);

      const products = await queryRunner.manager.find(Product, {
        where: productIds.map(id => ({ id })),
        lock: { mode: 'pessimistic_write' },
      });

      if (products.length !== productIds.length) {
        throw new NotFoundException('Certains produits du panier n\'existent pas.');
      }

      const vendorOrdersMap = new Map<string, { items: OrderItem[]; total: number }>();
      let globalTotal = 0;
      /** Produits dont le stock vient de traverser le seuil (remontés après commit). */
      const lowStockAlerts: { product: Product; quantity: number }[] = [];

      for (const cartItem of dto.cartItems) {
        const product = products.find(p => p.id === cartItem.productId);

        if (!product) {
          throw new NotFoundException(`Produit introuvable pour l'ID: ${cartItem.productId}`);
        }

        if (product.stock_quantity < cartItem.quantity) {
          throw new BadRequestException(`Stock insuffisant pour: ${product.name}`);
        }

        const previousQuantity = product.stock_quantity;
        product.stock_quantity -= cartItem.quantity;
        await queryRunner.manager.save(Product, product);

        // On alerte uniquement à la traversée du seuil : vendre 3 fois sous le
        // seuil ne doit pas marteler le vendeur.
        if (
          previousQuantity > LOW_STOCK_THRESHOLD &&
          product.stock_quantity <= LOW_STOCK_THRESHOLD
        ) {
          lowStockAlerts.push({ product, quantity: product.stock_quantity });
        }

        const orderItem = new OrderItem();
        orderItem.product_id = product.id;
        orderItem.quantity = cartItem.quantity;
        orderItem.price = product.price;

        if (!vendorOrdersMap.has(product.vendor_id)) {
          vendorOrdersMap.set(product.vendor_id, { items: [], total: 0 });
        }

        const vendorOrderData = vendorOrdersMap.get(product.vendor_id);
        if (vendorOrderData) {
          vendorOrderData.items.push(orderItem);
          vendorOrderData.total += Number(product.price) * cartItem.quantity;
          globalTotal += Number(product.price) * cartItem.quantity;
        }
      }

      const createdOrders: Order[] = [];
      const reference = generateReference();

      for (const [vendorId, data] of vendorOrdersMap.entries()) {
        const order = new Order();
        order.client_id = clientId;
        order.vendor_id = vendorId;
        order.total_amount = data.total;
        order.reference = reference;
        order.payment_phone = dto.paymentPhone;
        order.status = OrderStatus.PENDING_PAYMENT;
        order.items = data.items;

        const savedOrder = await queryRunner.manager.save(Order, order);
        createdOrders.push(savedOrder);
      }

      // Initialize Payment with globalTotal and the unique reference as orderId
      if (globalTotal > 0) {
         const paymentResponse = await this.paymentProvider.initiatePayment({
             amount: globalTotal,
             reference: reference,
             phone: dto.paymentPhone,
             operator: (dto.operator || 'WAVE') as any,
         });

         redirectUrl = paymentResponse.redirect_url;
         paymentUrls = paymentResponse.urls;
      }

      await queryRunner.commitTransaction();

      // Stock bas : émis APRÈS le commit (jamais sur une transaction risquée),
      // et jamais bloquant pour la commande.
      await this.notifyLowStock(lowStockAlerts);

      return {
        orders: createdOrders,
        reference,
        status: globalTotal > 0 ? 'PENDING_PAYMENT' : 'PAID',
        redirect_url: redirectUrl,
        urls: paymentUrls,
        message: `Paiement initié. Référence : ${reference}`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getClientOrders(clientId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { client_id: clientId },
      relations: ['items', 'items.product'],
      order: { created_at: 'DESC' },
    });
  }

  async getVendorOrders(vendorId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { vendor_id: vendorId },
      relations: ['items', 'items.product'],
      order: { created_at: 'DESC' },
    });
  }

  async updateOrderStatus(orderId: string, vendorId: string, status: OrderStatus): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, vendor_id: vendorId },
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable.');
    }

    order.status = status;
    const savedOrder = await this.orderRepo.save(order);

    if (order.payment_phone) {
      const ref = (order.reference || order.id).slice(0, 8).toUpperCase();
      let statusLabel = status.toString();
      if (status === OrderStatus.DELIVERED) statusLabel = 'LIVRÉE';
      else if (status === OrderStatus.PAID) statusLabel = 'CONFIRMÉE / ACCEPTÉE';
      else if (status === OrderStatus.CANCELLED) statusLabel = 'ANNULÉE';

      const message = status === OrderStatus.DELIVERED
        ? `Bonjour, votre commande EasyArena #${ref} a été marquée comme LIVRÉE avec succès par le vendeur. Merci pour votre achat !`
        : `Bonjour, le statut de votre commande EasyArena #${ref} a été mis à jour : ${statusLabel}.`;

      await this.notificationsService.sendRawSms(
        order.payment_phone,
        message,
      );
    }

    // In-app : le client suit sa commande depuis l'application.
    await this.notifyClientOrderStatus(order, status);

    return savedOrder;
  }

  /**
   * Le SMS part vers `payment_phone` (saisi au checkout, pas forcément le
   * compte) : l'in-app part lui du compte client réel, seul endroit où le
   * lien « Voir ma commande » a un sens.
   */
  private async notifyClientOrderStatus(
    order: Order,
    status: OrderStatus,
  ): Promise<void> {
    const copy: Partial<
      Record<OrderStatus, { type: NotificationType; title: string; message: string }>
    > = {
      [OrderStatus.DELIVERED]: {
        type: NotificationType.ORDER_DELIVERED,
        title: 'Commande livrée',
        message: `Votre commande a été livrée. Merci pour votre achat !`,
      },
      [OrderStatus.CANCELLED]: {
        type: NotificationType.ORDER_CANCELLED,
        title: 'Commande annulée',
        message: `Votre commande a été annulée par le vendeur.`,
      },
    };

    const info = copy[status];
    if (!info) return;

    const client = await this.dataSource.manager.findOne(Client, {
      where: { id: order.client_id },
      relations: ['user'],
    });
    if (!client?.user) return;

    const ref = (order.reference || order.id).slice(0, 8).toUpperCase();

    await this.notificationsService.notify({
      userId: client.user.id,
      type: info.type,
      title: info.title,
      message: `#${ref} — ${info.message}`,
      link: '/orders',
      metadata: {
        orderId: order.id,
        reference: order.reference,
        status,
        amount: Number(order.total_amount),
      },
      priority:
        status === OrderStatus.CANCELLED
          ? NotificationPriority.ACTION
          : NotificationPriority.INFO,
      dedupeKey: `order:${order.id}:${status}`,
    });
  }

  /**
   * Alerte de stock bas pour le vendeur du produit concerné.
   *
   * Chaque vœu ne peut viser que le propriétaire du stock : une commande
   * peut couvrir plusieurs vendeurs, ils ne doivent jamais voir le stock
   * d'un tiers. La clé porte la quantité, donc un réapprovisionnement puis
   * une nouvelle traversée du seuil retombera juste.
   */
  private async notifyLowStock(
    alerts: { product: Product; quantity: number }[],
  ): Promise<void> {
    if (alerts.length === 0) return;

    try {
      const vendorIds = [...new Set(alerts.map((a) => a.product.vendor_id))];
      const vendors: Vendor[] = vendorIds.length
        ? await this.dataSource.manager.find(Vendor, {
            where: { id: In(vendorIds) },
            relations: ['user'],
          })
        : [];

      for (const alert of alerts) {
        const vendor = vendors.find((v) => v.id === alert.product.vendor_id);
        if (!vendor?.user) continue;

        await this.notificationsService.notify({
          userId: vendor.user.id,
          type: NotificationType.STOCK_LOW,
          title: 'Stock bas',
          message:
            `« ${alert.product.name} » n'a plus que ${alert.quantity} ` +
            `unité${alert.quantity > 1 ? 's' : ''} en stock.`,
          link: '/vendor/products',
          metadata: {
            productId: alert.product.id,
            quantity: alert.quantity,
            threshold: LOW_STOCK_THRESHOLD,
          },
          priority: NotificationPriority.INFO,
          dedupeKey: `stock:${alert.product.id}:${alert.quantity}`,
        });
      }
    } catch (err) {
      // Jamais de rollback possible ici : on logue et on laisse partir la commande.
      this.logger.warn(`low-stock notification failed: ${err}`);
    }
  }
}
