import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Role } from '../../../common/enums';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @Matches(/^\+?\d{9,15}$/, { message: 'Invalid phone number' })
  phone: string;

  @IsEnum([Role.FIELD_ADMIN, Role.CONTROLLER], { message: 'Role must be field_admin or controller' })
  role: Role.FIELD_ADMIN | Role.CONTROLLER;
}
