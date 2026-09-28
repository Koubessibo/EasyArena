import { Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { User } from '../users/entities/user.entity';

/**
 * Boîte à lettres in-app de l'utilisateur connecté.
 * Chaque requête est scopée sur `user.id` : aucun accès inter-utilisateurs.
 * Le journal SMS/email n'est jamais exposé ici (filtré sur channel='in_app').
 */
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /api/v1/notifications?page&per_page&type&unread_only */
  @Get()
  getAll(@CurrentUser() user: User, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.getUserNotifications(user.id, {
      page: query.page,
      perPage: query.per_page,
      type: query.type,
      unreadOnly: query.unread_only === 'true',
    });
  }

  /** GET /api/v1/notifications/unread-count — léger, appelé par les badges. */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    const unread = await this.notificationsService.getUnreadCount(user.id);
    return { unread };
  }

  /** PUT /api/v1/notifications/read-all */
  @Put('read-all')
  markAllRead(@CurrentUser() user: User) {
    return this.notificationsService.markAllRead(user.id);
  }

  /** PUT /api/v1/notifications/:id/read */
  @Put(':id/read')
  markRead(@CurrentUser() user: User, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }
}
