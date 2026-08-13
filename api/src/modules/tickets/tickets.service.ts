import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventTicket } from './entities/event-ticket.entity';
import { SportEvent } from '../events/entities/sport-event.entity';
import { Client } from '../users/entities/client.entity';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/interfaces/payment-provider.interface';
import { MobileOperator } from '../../common/enums';
import { v4 as uuidv4 } from 'uuid';
import { NotificationsService } from '../notifications/notifications.service';
import { TotpService } from './totp.service';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(EventTicket)
    private readonly ticketRepo: Repository<EventTicket>,
    @InjectRepository(SportEvent)
    private readonly eventRepo: Repository<SportEvent>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
    private readonly notificationsService: NotificationsService,
    private readonly totpService: TotpService,
  ) {}

  async buyTicket(eventId: string, clientId: string, operator?: string, phone?: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Événement introuvable');
    }

    const price = Number(event.ticket_price || 0);

    // ── 1. Génération du secret TOTP unique pour ce billet ────────────────
    const totpSecret = this.totpService.generateSecret();
    this.logger.log(`🔐 TOTP Secret généré pour billet de l'event ${eventId}`);

    // ── 2. Création du Ticket avec le secret TOTP ─────────────────────────
    let ticket = this.ticketRepo.create({
      client_id: clientId,
      event_id: eventId,
      qrCodeToken: uuidv4(),   // Kept for backward compatibility
      totp_secret: totpSecret,  // NEW: Secret TOTP dynamique
      status: price > 0 ? 'PENDING_PAYMENT' : 'VALID',
    });
    ticket = await this.ticketRepo.save(ticket);

    // ── 3. Paiement Samir Money si ticket payant ──────────────────────────
    if (price > 0) {
      try {
        const client = await this.clientRepo.findOne({ where: { id: clientId }, relations: ['user'] });
        const paymentPhone = (phone && phone.trim().length > 0) ? phone : (client?.user?.phone || '');

        const op = (operator as MobileOperator) || MobileOperator.WAVE;
        const returnUrl = `http://localhost:4200/my-tickets?status=success&ticketId=${ticket.id}`;
        const paymentRes = await this.paymentProvider.initiatePayment({
          amount: price,
          operator: op,
          reference: ticket.id,
          phone: paymentPhone,
          returnUrl,
          callbackUrl: returnUrl,
        });

        if (!paymentRes || (!paymentRes.external_ref && !paymentRes.redirect_url)) {
          await this.ticketRepo.delete(ticket.id);
          throw new BadRequestException('Le paiement Samir Money a échoué. Ticket non généré.');
        }

        return {
          ticketId: ticket.id,
          status: 'PENDING_PAYMENT',
          redirect_url: paymentRes.redirect_url,
          urls: paymentRes.urls,
          external_ref: paymentRes.external_ref,
        };
      } catch (err: any) {
        await this.ticketRepo.delete(ticket.id);
        throw new BadRequestException(
          err?.message || 'Échec du paiement via Samir Money. Solde insuffisant ou erreur réseau.',
        );
      }
    }

    // ── 4. Ticket gratuit : SMS + retour avec le secret TOTP ─────────────
    const client = await this.clientRepo.findOne({ where: { id: clientId }, relations: ['user'] });
    const targetPhone = phone || client?.user?.phone;
    if (targetPhone) {
      const name = client?.user?.first_name || '';
      await this.notificationsService.sendRawSms(
        targetPhone,
        `Félicitations ${name}, votre billet pour ${event.name} est confirmé ! Votre QR Pass dynamique est disponible dans EasyArena.`,
      );
    }

    ticket.event = event;
    return {
      ticketId: ticket.id,
      status: 'VALID',
      // Le secret TOTP est retourné au frontend pour la génération des QR codes dynamiques
      totp_secret: totpSecret,
      data: ticket,
    };
  }

  async confirmTicketPayment(ticketId: string, clientId: string) {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, client_id: clientId },
      relations: ['event', 'client', 'client.user'],
    });
    if (!ticket) {
      throw new NotFoundException('Ticket introuvable.');
    }

    // Already confirmed — just return the ticket data
    if (ticket.status === 'VALID' || ticket.status === 'SCANNED') {
      return {
        ...ticket,
        totp_secret: ticket.totp_secret,
      };
    }

    if (ticket.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('Ce billet ne peut pas être confirmé.');
    }

    // Verify payment with SamirPay before confirming
    const verification = await this.paymentProvider.verifyTransaction(ticketId);
    this.logger.log(`[ConfirmTicket] Verification for ticket ${ticketId}: ${verification.status}`);

    if (verification.status !== 'SUCCESS') {
      return {
        id: ticket.id,
        status: ticket.status,
        payment_verified: false,
        message: 'Le paiement n\'a pas encore été confirmé par votre opérateur. Veuillez patienter ou réessayer.',
      };
    }

    // Payment verified — activate the ticket
    await this.ticketRepo.update(ticket.id, { status: 'VALID' });
    ticket.status = 'VALID';

    const u = ticket.client?.user;
    const targetPhone = u?.phone;
    const eventName = ticket.event?.name || 'Événement Sportif';

    if (targetPhone) {
      const msg = `Félicitations ${u?.first_name || ''}, votre paiement pour l'événement ${eventName} a été validé ! Votre QR Pass dynamique est disponible sur EasyArena.`;
      await this.notificationsService.sendRawSms(targetPhone, msg);
      if (u?.id) {
        await this.notificationsService.sendSms(u.id, targetPhone, msg);
      }
    }

    return {
      ...ticket,
      totp_secret: ticket.totp_secret,
    };
  }

  /**
   * VALIDATION TOTP SÉCURISÉE
   *
   * Reçoit : ticketId + token TOTP 6 chiffres du scanner
   * Vérifie : token valide pour ce billet à l'instant T (±30s de tolérance)
   * Protège : Anti-replay via passage atomique en SCANNED
   *
   * Codes d'erreur :
   *  - 404 : Billet introuvable
   *  - 401 : Token expiré ou invalide (capture d'écran frauduleuse !)
   *  - 400 : Billet déjà scanné (tentative de replay)
   */
  async validateTicket(ticketId: string, token: string) {
    // ── 1. Récupération du billet et son secret TOTP ───────────────────────
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['event', 'client', 'client.user'],
    });

    if (!ticket) {
      throw new NotFoundException('Billet introuvable.');
    }

    // ── 2. Vérification Anti-Replay (statut) ──────────────────────────────
    if (ticket.status === 'SCANNED') {
      this.logger.warn(`🚨 FRAUDE DÉTECTÉE : Billet ${ticketId} déjà scanné. Tentative de replay !`);
      throw new BadRequestException('Billet déjà utilisé. Fraude détectée.');
    }

    if (ticket.status !== 'VALID') {
      throw new BadRequestException(`Billet non valide (Statut : ${ticket.status}).`);
    }

    // ── 3. Vérification TOTP ───────────────────────────────────────────────
    if (!ticket.totp_secret) {
      // Fallback pour les anciens billets sans TOTP (migration progressive)
      this.logger.warn(`⚠️ Billet ${ticketId} sans TOTP secret (ancien système). Validation legacy.`);
      // Pour les anciens billets, on bloque plutôt que de bypasser la sécurité
      throw new UnauthorizedException('Ce billet utilise un ancien format. Veuillez contacter le support.');
    }

    const isTokenValid = this.totpService.verifyToken(token, ticket.totp_secret);

    if (!isTokenValid) {
      this.logger.warn(
        `🚨 TOKEN INVALIDE/EXPIRÉ : Billet ${ticketId} | token=${token} | Capture d'écran frauduleuse probable !`,
      );
      throw new UnauthorizedException(
        'Token expiré ou invalide. Ce QR code a dépassé sa fenêtre de validité de 30 secondes.',
      );
    }

    // ── 4. Verrouillage Atomique Anti-Replay ─────────────────────────────
    // UPDATE conditionnel : ne passe en SCANNED que si status = 'VALID'
    // Protège contre la race condition si deux scanners valident le même billet simultanément
    const updateResult = await this.ticketRepo
      .createQueryBuilder()
      .update(EventTicket)
      .set({ status: 'SCANNED', updated_at: new Date() })
      .where('id = :id AND status = :validStatus', {
        id: ticketId,
        validStatus: 'VALID',
      })
      .execute();

    if (updateResult.affected === 0) {
      // Race condition : un autre scanner a validé entre notre vérification et l'update
      this.logger.warn(`🚨 RACE CONDITION : Billet ${ticketId} déjà scanné entre la vérif et l'update !`);
      throw new BadRequestException('Billet déjà utilisé (validation concurrente détectée).');
    }

    // ── 5. Log de succès ──────────────────────────────────────────────────
    const firstName = ticket.client?.user?.first_name || '';
    const lastName = ticket.client?.user?.last_name || '';
    const holderName = `${firstName} ${lastName}`.trim() || 'Client EasyArena';

    this.logger.log(`✅ BILLET VALIDÉ : ${ticketId} | Porteur : ${holderName} | Événement : ${ticket.event?.name}`);

    return {
      ticketId: ticket.id,
      holderName,
      eventName: ticket.event?.name || 'Événement',
      validatedAt: new Date().toISOString(),
    };
  }

  async getClientTickets(clientId: string) {
    const tickets = await this.ticketRepo.find({
      where: { client_id: clientId },
      relations: ['event'],
      order: { created_at: 'DESC' },
    });

    // IMPORTANT : On ne renvoie JAMAIS le totp_secret dans la liste
    // Le secret est exposé uniquement lors de l'achat ou de la confirmation
    // Pour l'affichage du QR, le frontend génère le token localement
    return tickets.map((t) => ({
      id: t.id,
      event: t.event,
      status: t.status,
      created_at: t.created_at,
      // totp_secret intentionally omitted from list view for security
    }));
  }

  /**
   * Endpoint sécurisé : retourne le totp_secret d'un billet spécifique
   * pour permettre au frontend de générer son QR code dynamique.
   * Vérifie que le billet appartient bien au client demandeur (Anti-IDOR).
   */
  async getTicketSecret(ticketId: string, clientId: string) {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, client_id: clientId },
      relations: ['event'],
    });

    if (!ticket) {
      throw new NotFoundException('Billet introuvable ou accès non autorisé.');
    }

    if (ticket.status === 'SCANNED') {
      throw new BadRequestException('Ce billet a déjà été utilisé.');
    }

    return {
      ticketId: ticket.id,
      totp_secret: ticket.totp_secret,
      event: ticket.event,
      status: ticket.status,
    };
  }
}
