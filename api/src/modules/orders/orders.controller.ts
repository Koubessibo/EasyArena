import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { OrderStatus } from './entities/order.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.CLIENT)
  @Post('checkout')
  async checkout(@Body() dto: CheckoutDto, @CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const result = await this.ordersService.checkout(clientId, dto);

    return {
      success: true,
      message: result.message,
      data: {
        orders: result.orders,
        reference: result.reference,
        status: result.status,
        redirect_url: result.redirect_url,
        urls: result.urls,
      },
    };
  }

  @Roles(Role.CLIENT)
  @Get('my-orders')
  async getMyOrders(@CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const orders = await this.ordersService.getClientOrders(clientId);

    return {
      success: true,
      data: orders,
    };
  }

  @Roles(Role.VENDOR)
  @Get('vendor')
  async getVendorOrders(@CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const orders = await this.ordersService.getVendorOrders(vendorId);
    
    return {
      success: true,
      data: orders,
    };
  }

  @Roles(Role.VENDOR)
  @Patch(':id/deliver')
  async markAsDelivered(@Param('id') orderId: string, @CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const order = await this.ordersService.updateOrderStatus(orderId, vendorId, OrderStatus.DELIVERED);
    
    return {
      success: true,
      message: 'Commande marquée comme livrée.',
      data: order,
    };
  }
}
