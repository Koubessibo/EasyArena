import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ArticleStatus, FieldStatus, Role, UserStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { AdminService } from './admin.service';
import { UsersService } from '../users/users.service';
import { CreateOwnerDto } from '../users/dto/create-owner.dto';
import { CreateVendorDto } from '../users/dto/create-vendor.dto';
import { InviteUserDto } from '../users/dto/invite-user.dto';
import { UpdateUserStatusDto } from '../users/dto/update-user-status.dto';
import { ValidateWithdrawalDto } from '../withdrawals/dto/validate-withdrawal.dto';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { SponsorshipService } from '../sponsorship/sponsorship.service';
import { UpdateSponsorshipSettingsDto } from './dto/update-sponsorship-settings.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class UpdateFieldStatusDto { @IsEnum(FieldStatus) status: FieldStatus; }
class UpdateArticleStatusDto { @IsEnum(ArticleStatus) status: ArticleStatus; }
class RejectEnrollmentDto { @IsString() @IsOptional() rejection_note?: string; }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly enrollmentService: EnrollmentService,
    private readonly sponsorshipService: SponsorshipService,
  ) {}

  @Get('stats')
  getStats(@Query('period') period?: string) {
    return this.adminService.getStats((period as any) ?? 'all_time');
  }

  @Get('dashboard/stats')
  async getDashboardStats() {
    const stats = await this.adminService.getGlobalDashboardStats();
    return {
      success: true,
      data: stats,
    };
  }

  @Get('stats/monthly-revenue')
  getMonthlyRevenue() {
    return this.adminService.getMonthlyRevenue();
  }

  @Get('users')
  listUsers(
    @Query('role') role?: Role,
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    return this.adminService.listUsers({
      role,
      status,
      search,
      page: page ? parseInt(page) : 1,
      per_page: perPage ? parseInt(perPage) : 20,
    });
  }

  @Post('users/owner')
  createOwner(@Body() dto: CreateOwnerDto) {
    return this.adminService.createOwner(dto);
  }

  @Post('users/vendor')
  createVendor(@Body() dto: CreateVendorDto) {
    return this.adminService.createVendor(dto);
  }

  @Put('users/:id/status')
  updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(id, dto);
  }

  @Patch('users/:id/sponsorship-settings')
  updateUserSponsorshipSettings(
    @Param('id') id: string,
    @Body() dto: UpdateSponsorshipSettingsDto,
  ) {
    return this.sponsorshipService.updateUserSponsorshipSettings(id, dto);
  }

  /**
   * POST /admin/users/invite
   * Invite un nouvel utilisateur avec parrainage.
   * Le referrer_id est pris du payload ; si absent, on utilise l'id de l'admin connecté.
   */
  @Post('users/invite')
  inviteUser(
    @CurrentUser() admin: User,
    @Body() dto: InviteUserDto,
  ) {
    // Règle métier : si le frontend n'envoie pas de referrer_id, on utilise
    // l'identifiant de l'administrateur actuellement connecté comme parrain.
    if (!dto.referrer_id) {
      dto.referrer_id = admin.id;
    }
    return this.usersService.inviteUser(dto);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Get('bookings')
  listBookings(@Query('page') page?: string, @Query('per_page') perPage?: string) {
    return this.adminService.listAllBookings(
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 20,
    );
  }

  @Get('withdrawals')
  listWithdrawals(@Query('page') page?: string, @Query('per_page') perPage?: string) {
    return this.adminService.listAllWithdrawals(
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 20,
    );
  }

  @Put('withdrawals/:id/validate')
  validateWithdrawal(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: ValidateWithdrawalDto,
  ) {
    return this.adminService.validateWithdrawal(admin, id, dto);
  }

  @Put('withdrawals/:id/reject')
  rejectWithdrawal(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: ValidateWithdrawalDto,
  ) {
    return this.adminService.validateWithdrawal(admin, id, dto);
  }

  // ── RETRAITS PARRAINAGE / AMBASSADEUR (MLM) ────────────────────────
  @Get('sponsorship-withdrawals')
  listSponsorshipWithdrawals() {
    return this.sponsorshipService.listPendingWithdrawals();
  }

  @Put('sponsorship-withdrawals/:id/validate')
  validateSponsorshipWithdrawal(
    @CurrentUser() admin: User,
    @Param('id') id: string,
  ) {
    return this.sponsorshipService.validateWithdrawal(admin.id, id, 'APPROVE');
  }

  @Put('sponsorship-withdrawals/:id/reject')
  rejectSponsorshipWithdrawal(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() body: { rejection_note?: string },
  ) {
    return this.sponsorshipService.validateWithdrawal(admin.id, id, 'REJECT', body?.rejection_note);
  }

  @Get('fields')
  listFields(
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('status') status?: FieldStatus,
  ) {
    return this.adminService.listFields(
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 20,
      status,
    );
  }

  @Put('fields/:id/status')
  updateFieldStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateFieldStatusDto,
  ) {
    return this.adminService.updateFieldStatus(id, dto.status, admin);
  }

  @Get('articles')
  listArticles(
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('status') status?: ArticleStatus,
  ) {
    return this.adminService.listArticles(
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 20,
      status,
    );
  }

  @Put('articles/:id/status')
  updateArticleStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateArticleStatusDto,
  ) {
    return this.adminService.updateArticleStatus(id, dto.status, admin);
  }

  @Get('enrollment-requests')
  listEnrollmentRequests(@Query('status') status?: string) {
    return this.enrollmentService.findAll(status);
  }

  @Put('enrollment-requests/:id/approve')
  approveEnrollment(@Param('id') id: string) {
    return this.enrollmentService.approve(id);
  }

  @Put('enrollment-requests/:id/reject')
  rejectEnrollment(@Param('id') id: string, @Body() dto: RejectEnrollmentDto) {
    return this.enrollmentService.reject(id, dto.rejection_note);
  }
}
