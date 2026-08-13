import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorEarningsController } from './vendor-earnings.controller';
import { VendorEarningsService } from './vendor-earnings.service';
import { VendorWithdrawal } from './entities/vendor-withdrawal.entity';
import { Order } from '../orders/entities/order.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorWithdrawal, Order]),
    UsersModule,
  ],
  controllers: [VendorEarningsController],
  providers: [VendorEarningsService],
  exports: [VendorEarningsService],
})
export class VendorEarningsModule {}
