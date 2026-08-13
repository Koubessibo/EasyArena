import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPinDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}
