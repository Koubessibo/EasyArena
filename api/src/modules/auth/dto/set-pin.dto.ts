import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class SetPinDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be numeric' })
  pin: string;
}
