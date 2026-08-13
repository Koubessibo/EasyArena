import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

export class ValidateTicketDto {
  @IsUUID('4')
  @IsNotEmpty()
  ticketId: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Le token TOTP doit faire exactement 6 chiffres' })
  token: string;
}
