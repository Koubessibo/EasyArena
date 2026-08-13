import { IsString, Length, Matches } from 'class-validator';

export class ChangePinDto {
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be numeric' })
  old_pin: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be numeric' })
  new_pin: string;
}
