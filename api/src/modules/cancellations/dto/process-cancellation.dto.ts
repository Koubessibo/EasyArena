import { IsBoolean, IsNotEmpty, IsUUID } from 'class-validator';

export class ProcessCancellationDto {
  @IsUUID('4')
  @IsNotEmpty()
  reservation_id: string;

  @IsBoolean()
  @IsNotEmpty()
  is_accepted: boolean;
}
