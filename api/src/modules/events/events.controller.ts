import { Body, Controller, Post, Get, Put, Delete, Param, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get('active')
  async getActiveEvents() {
    const events = await this.eventsService.getActiveEvents();
    return {
      success: true,
      data: events,
    };
  }

  @Roles(Role.OWNER)
  @Get('owner/my-events')
  async getOwnerEvents(@CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const events = await this.eventsService.getOwnerEvents(ownerId);
    return {
      success: true,
      data: events,
    };
  }

  @Roles(Role.OWNER)
  @Post()
  async createEvent(@Body() dto: CreateEventDto, @CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const event = await this.eventsService.createEvent(dto, ownerId);
    
    return {
      success: true,
      message: 'Événement sportif créé avec succès',
      data: event,
    };
  }

  @Roles(Role.OWNER)
  @Put(':id')
  async updateEvent(
    @Param('id') id: string,
    @Body() dto: Partial<CreateEventDto>,
    @CurrentUser() user: User,
  ) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    const event = await this.eventsService.updateEvent(id, dto, ownerId);
    return {
      success: true,
      message: 'Événement mis à jour avec succès',
      data: event,
    };
  }

  @Roles(Role.OWNER)
  @Delete(':id')
  async deleteEvent(@Param('id') id: string, @CurrentUser() user: User) {
    const ownerId = await this.usersService.resolveOwnerId(user);
    await this.eventsService.deleteEvent(id, ownerId);
    return {
      success: true,
      message: 'Événement supprimé avec succès',
    };
  }
}
