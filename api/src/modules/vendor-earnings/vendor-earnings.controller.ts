import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { VendorEarningsService } from './vendor-earnings.service';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendor')
export class VendorEarningsController {
  constructor(
    private readonly earningsService: VendorEarningsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.VENDOR)
  @Get('earnings')
  async getEarningsDashboard(@CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const dashboard = await this.earningsService.getEarningsDashboard(vendorId);
    
    return {
      success: true,
      data: dashboard,
    };
  }

  @Roles(Role.VENDOR)
  @Post('withdraw')
  async requestWithdrawal(@Body() dto: RequestWithdrawalDto, @CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const withdrawal = await this.earningsService.requestWithdrawal(vendorId, dto.amount);
    
    return {
      success: true,
      message: 'Demande de retrait transmise à Samir Money avec succès.',
      data: withdrawal,
    };
  }
}
