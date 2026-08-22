import { Body, Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { BuyTicketDto } from './dto/buy-ticket.dto';
import { ValidateTicketDto } from './dto/validate-ticket.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.CLIENT)
  @Post('buy')
  async buyTicket(@Body() dto: BuyTicketDto & { operator?: string; phone?: string }, @CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const ticket = await this.ticketsService.buyTicket(dto.eventId, clientId, dto.operator, dto.phone);

    return {
      success: true,
      message: 'Ticket acheté avec succès',
      data: ticket,
    };
  }

  @Roles(Role.CLIENT)
  @Get('confirm/:ticketId')
  async confirmTicketPayment(@Param('ticketId') ticketId: string, @CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const ticket = await this.ticketsService.confirmTicketPayment(ticketId, clientId);
    return {
      success: true,
      message: 'Paiement du ticket confirmé et SMS envoyé !',
      data: ticket,
    };
  }

  @Roles(Role.CLIENT)
  @Get('my-tickets')
  async getMyTickets(@CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const tickets = await this.ticketsService.getClientTickets(clientId);
    return {
      success: true,
      data: tickets,
    };
  }

  /**
   * GET /tickets/:ticketId/secret
   * Retourne le totp_secret d'un billet pour affichage QR dynamique côté frontend.
   * Protégé : seul le propriétaire du billet peut récupérer son secret (Anti-IDOR).
   */
  @Roles(Role.CLIENT)
  @Get(':ticketId/secret')
  async getTicketSecret(@Param('ticketId') ticketId: string, @CurrentUser() user: User) {
    const clientId = await this.usersService.resolveClientId(user);
    const result = await this.ticketsService.getTicketSecret(ticketId, clientId);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * POST /tickets/validate
   * Validation TOTP par le scanner (Contrôleur/Owner/Admin).
   *
   * Body: { ticketId: string, token: string }
   *
   * - Vérifie que le token TOTP est valide à l'instant T (±30s)
   * - Passe le billet en SCANNED (verrouillage anti-replay atomique)
   * - Renvoie 401 si le token est expiré (fraude par capture d'écran détectée)
   */
  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER, Role.ADMIN)
  @Post('validate')
  async validateTicket(@Body() dto: ValidateTicketDto, @CurrentUser() user: User) {
    const result = await this.ticketsService.validateTicket(dto.ticketId, dto.token, user);
    return {
      success: true,
      message: '✅ Ticket validé avec succès',
      data: result,
    };
  }
}
