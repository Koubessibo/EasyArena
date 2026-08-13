import { Body, Controller, Post, Get, Put, Delete, Param, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get('plans/all')
  async getAllPlans() {
    const plans = await this.subscriptionsService.getAllPlans();
    return { success: true, data: plans };
  }

  @Roles(Role.OWNER)
  @Get('plans/owner/my-plans')
  async getMyOwnerPlans(@CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const plans = await this.subscriptionsService.getPlansForOwner(ownerId);
    return { success: true, data: plans };
  }

  @Roles(Role.CLIENT)
  @Get('plans/:ownerId')
  async getPlans(@Param('ownerId') ownerId: string) {
    const plans = await this.subscriptionsService.getPlansForOwner(ownerId);
    return {
      success: true,
      data: plans,
    };
  }

  @Roles(Role.CLIENT)
  @Get('my-subscriptions')
  async getMySubscriptions(@CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const subs = await this.subscriptionsService.getClientSubscriptions(clientId);
    return { success: true, data: subs };
  }

  @Roles(Role.OWNER)
  @Post('plans')
  async createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const plan = await this.subscriptionsService.createPlan(dto, ownerId);
    return {
      success: true,
      message: 'Plan de souscription créé avec succès',
      data: plan,
    };
  }

  @Roles(Role.OWNER)
  @Put('plans/:id')
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePlanDto>,
    @CurrentUser() user: User,
  ) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const plan = await this.subscriptionsService.updatePlan(id, dto, ownerId);
    return {
      success: true,
      message: 'Plan de souscription mis à jour avec succès',
      data: plan,
    };
  }

  @Roles(Role.OWNER)
  @Delete('plans/:id')
  async deletePlan(@Param('id') id: string, @CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    await this.subscriptionsService.deletePlan(id, ownerId);
    return {
      success: true,
      message: 'Plan de souscription supprimé avec succès',
    };
  }

  @Roles(Role.CLIENT)
  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const result = await this.subscriptionsService.subscribeClient(dto.plan_id, clientId, dto.paymentPhone, dto.operator);
    
    return {
      success: true,
      message: 'Souscription initiée et échéancier généré',
      data: result,
    };
  }
}
