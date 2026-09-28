import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsPositive,
  ValidateBy,
  buildMessage,
  type ValidationOptions,
} from 'class-validator';
import { NotificationType } from '../../../common/enums';

const TYPE_VALUES = Object.values(NotificationType) as string[];

/**
 * Accepte une liste de critères séparés par des virgules, chacun étant un
 * type exact (`booking_confirmed`) **ou** un préfixe thématique se terminant
 * par `_` (`booking_`, `order_`, `withdrawal_`).
 *
 * Sans le préfixe, un filtre thématique serait incompatible avec la
 * pagination : le serveur doit renvoyer un total cohérent avec le filtre.
 * Une valeur inconnue → 400 immédiat, pas un filtre silencieusement vide.
 */
function IsNotificationTypeFilter(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isNotificationTypeFilter',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string') return false;
          const parts = value
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length === 0) return false;
          return parts.every(
            (part) =>
              TYPE_VALUES.includes(part) ||
              (part.endsWith('_') &&
                TYPE_VALUES.some((v) => v.startsWith(part))),
          );
        },
        defaultMessage: buildMessage(
          (each) =>
            `${each}$property must be a comma-separated list of known notification types or type prefixes ending with "_"`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

export class ListNotificationsQueryDto {
  @IsNotificationTypeFilter() @IsOptional() type?: string;
  @IsIn(['true', 'false']) @IsOptional() unread_only?: 'true' | 'false';
  @IsPositive() @IsOptional() @Type(() => Number) page?: number;
  @IsPositive() @IsOptional() @Type(() => Number) per_page?: number;
}
