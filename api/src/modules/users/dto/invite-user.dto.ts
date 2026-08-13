import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { Role } from '../../../common/enums';

/**
 * Rôles invitables depuis le tableau de bord Super Admin.
 * On exclut ADMIN (ne peut pas s'auto-inviter) et les rôles de staff
 * (créés via le flux propriétaire).
 */
export const INVITABLE_ROLES = [
  Role.CLIENT,
  Role.OWNER,
  Role.VENDOR,
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export class InviteUserDto {
  /** Prénom de l'invité */
  @IsString()
  @IsNotEmpty()
  first_name: string;

  /** Nom de famille de l'invité */
  @IsString()
  @IsNotEmpty()
  last_name: string;

  /** Numéro de téléphone — clé unique de l'utilisateur dans le système */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: 'phone must be a valid international phone number (e.g. +221700000000)',
  })
  phone: string;

  /** Email (optionnel — le système fonctionne principalement par SMS) */
  @IsEmail()
  @IsOptional()
  email?: string;

  /**
   * Profil cible de l'invité.
   * Valeurs acceptées : 'client' | 'owner' | 'vendor'
   */
  @IsEnum(INVITABLE_ROLES, {
    message: `role must be one of: ${INVITABLE_ROLES.join(', ')}`,
  })
  role: InvitableRole;

  /**
   * Identifiant de l'administrateur qui envoie l'invitation.
   * Utilisé pour tracer le parrainage et déclencher le programme de récompenses.
   * Optionnel : si absent, l'invitation est enregistrée sans parrain.
   */
  @IsUUID('4', { message: 'referrer_id must be a valid UUID v4' })
  @IsOptional()
  referrer_id?: string;
}
