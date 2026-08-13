import {
  Body, Controller, Delete, Get, Param, Post, Put, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { WithdrawalsService } from './withdrawals.service';
import { TransactionsService } from '../transactions/transactions.service';
import { UsersService } from '../users/users.service';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';
import { CreateStaffDto } from '../users/dto/create-staff.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('owner')
export class WithdrawalsController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    private readonly transactionsService: TransactionsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('balance')
  getBalance(@CurrentUser() user: User) {
    return this.withdrawalsService.getOwnerBalance(user);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const ownerId = await this.withdrawalsService.getOwnerIdForUser(user);
    return this.transactionsService.getOwnerTransactions(
      ownerId,
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 20,
      startDate,
      endDate,
    );
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post('withdrawals/send-otp')
  sendWithdrawalOtp(@CurrentUser() user: User) {
    return this.withdrawalsService.sendWithdrawalOtp(user);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post('withdrawals/upload-rib')
  @UseInterceptors(FileInterceptor('rib'))
  uploadRib(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.withdrawalsService.uploadRib(user, file);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: User, @Body() dto: RequestWithdrawalDto) {
    return this.withdrawalsService.requestWithdrawal(user, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('withdrawals')
  getWithdrawals(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.withdrawalsService.getOwnerWithdrawals(
      user,
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 20,
      startDate,
      endDate,
    );
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('withdrawals/:id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.withdrawalsService.getWithdrawalById(user, id);
  }

  // ── Staff permissions ─────────────────────────────────────────────────

  @Roles(Role.OWNER)
  @Put('staff/:staffId/can-withdraw')
  updateStaffCanWithdraw(
    @CurrentUser() user: User,
    @Param('staffId') staffId: string,
    @Body('can_withdraw') canWithdraw: boolean,
  ) {
    return this.usersService.updateStaffCanWithdraw(user, staffId, canWithdraw);
  }

  // ── Staff CRUD ────────────────────────────────────────────────────────

  @Roles(Role.OWNER)
  @Post('staff')
  createStaff(@CurrentUser() user: User, @Body() dto: CreateStaffDto) {
    return this.usersService.createStaff(user, dto);
  }

  @Roles(Role.OWNER)
  @Get('staff')
  listStaff(@CurrentUser() user: User) {
    return this.usersService.listStaffByOwner(user);
  }

  @Roles(Role.OWNER)
  @Delete('staff/:id')
  deleteStaff(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.deleteStaff(user, id);
  }
}
