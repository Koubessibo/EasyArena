import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Le code OTP est obligatoire.' })
  otp: string;

  @IsOptional()
  @IsString()
  newPassword?: string;

  @IsOptional()
  @IsString()
  new_password?: string;

  @IsOptional()
  @IsString()
  new_pin?: string;

  @IsOptional()
  @IsString()
  pin?: string;
}
