import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'open_at must be HH:MM (00:00-23:59)' })
  open_at: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'close_at must be HH:MM (00:00-23:59, use 03:00 for 3am next day)' })
  close_at: string;

  @IsNumber()
  @Min(0)
  price_per_slot: number;

  @IsInt()
  @Min(15)
  slot_duration_min: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_per_slot?: number;
}
