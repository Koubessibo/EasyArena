import { IsNotEmpty, IsUUID } from 'class-validator';

export class RequestCancellationDto {
  @IsUUID('4')
  @IsNotEmpty()
  reservation_id: string;
}
