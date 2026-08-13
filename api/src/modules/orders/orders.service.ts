import { BadRequestException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

@Injectable()
export class OrdersService {
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

      for (const cartItem of dto.cartItems) {
        const product = products.find(p => p.id === cartItem.productId);

        if (!product) {
          throw new NotFoundException(`Produit introuvable pour l'ID: ${cartItem.productId}`);
        }

        if (product.stock_quantity < cartItem.quantity) {
          throw new BadRequestException(`Stock insuffisant pour: ${product.name}`);
        }

        product.stock_quantity -= cartItem.quantity;
        await queryRunner.manager.save(Product, product);

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

    return savedOrder;
  }
}
