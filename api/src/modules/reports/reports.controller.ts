import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('transactions')
  async getTransactions(@CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const transactions = await this.reportsService.getOwnerTransactions(ownerId);
    
    return {
      success: true,
      data: transactions,
    };
  }
}
