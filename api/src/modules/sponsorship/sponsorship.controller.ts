import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { SponsorshipService } from './sponsorship.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { WithdrawSponsorshipDto } from './dto/withdraw-sponsorship.dto';

@Controller('sponsorship')
export class SponsorshipController {
  constructor(private readonly sponsorshipService: SponsorshipService) {}

  @Post('link')
  @Roles(Role.ADMIN)
  async createLink(
    @Body() body: { sponsor_id: string; referee_id: string; referee_role: string },
  ) {
    return this.sponsorshipService.createSponsorship(
      body.sponsor_id,
      body.referee_id,
      body.referee_role,
    );
  }

  @Patch('users/:id/ambassador-status')
  @Roles(Role.ADMIN)
  async setAmbassadorStatus(
    @Param('id') userId: string,
    @Body() body: { is_ambassador: boolean },
  ) {
    await this.sponsorshipService.setAmbassadorStatus(userId, body.is_ambassador);
    return { success: true, message: body.is_ambassador ? 'Promu Ambassadeur' : 'Rétrogradé Client' };
  }

  @Get('stats/:userId')
  @Roles(Role.ADMIN)
  async getStats(@Param('userId') userId: string) {
    return this.sponsorshipService.getSponsorshipStats(userId);
  }

  @Get('my-stats')
  async getMyStats(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.sponsorshipService.getMyStats(userId);
  }

  @Post('withdraw/otp')
  async sendWithdrawOtp(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.sponsorshipService.sendWithdrawalOtp(userId);
  }

  @Post('withdraw')
  async requestWithdrawal(@Req() req: any, @Body() dto: WithdrawSponsorshipDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.sponsorshipService.requestWithdrawal(userId, dto);
  }

  @Get('admin/withdrawals')
  @Roles(Role.ADMIN)
  async listPendingWithdrawals() {
    return this.sponsorshipService.listPendingWithdrawals();
  }

  @Put('admin/withdrawals/:id/validate')
  @Roles(Role.ADMIN)
  async validateWithdrawal(
    @CurrentUser() admin: User,
    @Param('id') id: string,
  ) {
    return this.sponsorshipService.validateWithdrawal(admin.id, id, 'APPROVE');
  }

  @Put('admin/withdrawals/:id/reject')
  @Roles(Role.ADMIN)
  async rejectWithdrawal(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() body: { rejection_note?: string },
  ) {
    return this.sponsorshipService.validateWithdrawal(admin.id, id, 'REJECT', body?.rejection_note);
  }

  @Get('platform-totals')
  @Roles(Role.ADMIN)
  async getPlatformTotals() {
    return this.sponsorshipService.getPlatformTotals();
  }
}
