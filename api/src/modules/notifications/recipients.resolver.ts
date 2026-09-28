import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../common/enums';

/**
 * Résolution des destinataires collectifs.
 *
 * Volontairement séparé de `NotificationsService` : ce dernier est déjà
 * injecté par `UsersService` (envoi de SMS), donc lui ajouter une dépendance
 * vers les dépôts utilisateurs créerait un cycle. Ce résolveur ne dépend
 * que de dépôts, jamais d'un autre service.
 *
 * Il porte la matrice des rôles :
 * - `field_admin`  → même vue opérationnelle que le propriétaire
 * - `controller`   → uniquement ses assignations et résumés de shift
 * - `admin`        → enrôlements, retraits, alertes système
 */
@Injectable()
export class RecipientsResolver {
  constructor(
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Les `field_admin` rattachés à un propriétaire.
   * Les `controller` sont explicitement exclus : un contrôleur ne doit
   * jamais être sollicité sur la vie commerciale d'un terrain.
   */
  async fieldAdminsOf(ownerId: string): Promise<string[]> {
    const staff = await this.staffRepo.find({
      where: { owner_id: ownerId },
      relations: ['user'],
    });
    return staff
      .filter((s) => s.user?.role === Role.FIELD_ADMIN && s.user?.id)
      .map((s) => s.user.id);
  }

  /** Les `field_admin` + le propriétaire lui-même. */
  async ownerTeamOf(ownerId: string, ownerUserId: string): Promise<string[]> {
    return [ownerUserId, ...(await this.fieldAdminsOf(ownerId))];
  }

  /** Les `controller` assignés à un terrain. */
  async controllersOfField(fieldId: string): Promise<string[]> {
    const staff = await this.staffRepo.find({
      where: { field_id: fieldId },
      relations: ['user'],
    });
    return staff
      .filter((s) => s.user?.role === Role.CONTROLLER && s.user?.id)
      .map((s) => s.user.id);
  }

  /** Tous les comptes super-admin (rôles `admin`). */
  async admins(): Promise<string[]> {
    const users = await this.userRepo.find({ where: { role: Role.ADMIN } });
    return users.map((u) => u.id).filter(Boolean);
  }
}
