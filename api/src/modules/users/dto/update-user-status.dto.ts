import { IsEnum } from 'class-validator';
import { UserStatus } from '../../../common/enums';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}
