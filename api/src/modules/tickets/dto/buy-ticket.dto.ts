import { IsNotEmpty, IsUUID } from 'class-validator';

export class BuyTicketDto {
  @IsUUID('4')
  @IsNotEmpty()
  eventId: string;
}
