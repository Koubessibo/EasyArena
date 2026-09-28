import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Socket, Server, DefaultEventsMap } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationChannel, UserStatus } from '../../common/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const NAMESPACE = '/notifications';

/**
 * Socket dont `data` est renseigné par l'authentification.
 * Sans ça, `Socket` typé `data: any` masque les fautes de frappe.
 */
type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { userId?: string }
>;

/**
 * Canal temps réel des notifications in-app.
 *
 * Authentification à la connexion : JWT access token passé dans
 * `handshake.auth.token` (recommandé), `Authorization: Bearer` ou
 * `?token=`. Un jeton absent / invalide / un compte non actif déconnecte
 * immédiatement le client : aucune donnée n'échange sur un socket anonyme.
 *
 * Chaque client rejoint automatiquement la room `user:{userId}`, seule pièce
 * à laquelle il a droit. Il n'existe aucun moyen d'abonner un socket à un
 * autre utilisateur.
 *
 * Événements émis :
 *  - `notification:init`  { unread }            à la connexion
 *  - `notification:new`    Notification          notification fraîche
 *  - `notification:read`   { ids, unread }       lecture sur un autre device
 *  - `notification:unread` { unread }            rafraîchissement de badge
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: NAMESPACE })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const userId = await this.authenticate(client);
      if (!userId) {
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      await client.join(NotificationsGateway.room(userId));

      // Hydrate le badge dès la connexion, avant toute requête REST.
      this.emitInit(userId, await this.unreadCount(userId));
    } catch (err) {
      this.logger.warn(
        `WS ${NAMESPACE} refusé: ${(err as Error).message} [${client.id}]`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data.userId;
    if (userId) this.logger.debug(`WS ${NAMESPACE} fermé pour ${userId}`);
  }

  // ── Émission ────────────────────────────────────────────────────────────

  /** Pousse une notification fraîche à tous les devices d'un utilisateur. */
  emitNew(notification: Notification): void {
    this.toUser(notification.user_id, 'notification:new', notification);
  }

  /** Synchronise les badges après une lecture effectuée sur un autre device. */
  emitRead(userId: string, ids: string[], unread: number): void {
    this.toUser(userId, 'notification:read', { ids, unread });
  }

  /** Rafraîchit uniquement le compteur (ex: après création en batch). */
  emitUnread(userId: string, unread: number): void {
    this.toUser(userId, 'notification:unread', { unread });
  }

  /** Compteur envoyé à la connexion pour hydrater les badges. */
  emitInit(userId: string, unread: number): void {
    this.toUser(userId, 'notification:init', { unread });
  }

  // ── Privées ─────────────────────────────────────────────────────────────

  private static room(userId: string): string {
    return `user:${userId}`;
  }

  private toUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(NotificationsGateway.room(userId)).emit(event, payload);
  }

  private async unreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: {
        user_id: userId,
        is_read: false,
        channel: NotificationChannel.IN_APP,
      },
    });
  }

  /** Renvoie l'userId si le jeton est valide et le compte actif, sinon null. */
  private async authenticate(
    client: AuthenticatedSocket,
  ): Promise<string | null> {
    const token = this.extractToken(client);
    if (!token) return null;

    const secret = this.configService.get<string>('jwt.accessSecret');
    if (!secret) throw new Error('JWT_ACCESS_SECRET manquant');

    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
      secret,
    });
    if (!payload?.sub) return null;

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return null;

    return user.id;
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    const { auth, headers, query } = client.handshake;

    const candidates = [
      (auth as Record<string, unknown> | undefined)?.token,
      headers?.authorization,
      (query as Record<string, unknown> | undefined)?.token,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || candidate.length === 0) continue;
      return candidate.startsWith('Bearer ') ? candidate.slice(7) : candidate;
    }
    return null;
  }
}
