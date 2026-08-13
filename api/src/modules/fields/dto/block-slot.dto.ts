import { IsDateString, IsNotEmpty, IsString, Matches } from 'class-validator';

export class BlockSlotDto {
  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'slot_start must be HH:MM' })
  slot_start: string;
}
