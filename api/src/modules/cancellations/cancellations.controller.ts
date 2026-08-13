import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { CancellationsService } from './cancellations.service';
import { RequestCancellationDto } from './dto/request-cancellation.dto';
import { ProcessCancellationDto } from './dto/process-cancellation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cancellations')
export class CancellationsController {
  constructor(
    private readonly cancellationsService: CancellationsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.OWNER)
  @Get('pending')
  async getPendingRequests(@CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const requests = await this.cancellationsService.getPendingRequests(ownerId);
    return {
      success: true,
      data: requests,
    };
  }

  @Roles(Role.CLIENT)
  @Post('request')
  async requestCancellation(@Body() dto: RequestCancellationDto, @CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const booking = await this.cancellationsService.requestCancellation(dto.reservation_id, clientId);
    
    return {
      success: true,
      message: 'Demande d\'annulation envoyée avec succès',
      data: booking,
    };
  }

  @Roles(Role.OWNER)
  @Post('process')
  async processCancellation(@Body() dto: ProcessCancellationDto, @CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const result = await this.cancellationsService.processCancellation(dto.reservation_id, ownerId, dto.is_accepted);
    
    return {
      success: true,
      message: result.message,
      data: result,
    };
  }
}
