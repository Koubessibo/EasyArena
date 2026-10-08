import { Role } from '../../../common/enums';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: Role;
  /**
   * Jeton à usage restreint (configuration du code PIN). Sa présence interdit
   * l'utilisation comme jeton d'accès : voir JwtStrategy.validate().
   */
  purpose?: string;
}

/** Usage d'un jeton court, distinct d'un jeton d'accès classique. */
export const PIN_SETUP_TOKEN_PURPOSE = 'pin-setup';
