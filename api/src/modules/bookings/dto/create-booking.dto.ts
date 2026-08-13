import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @IsString() @IsNotEmpty() field_id: string;
  @IsString() @IsNotEmpty() schedule_id: string;

  @IsDateString()
  booking_date: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'slot_start must be HH:MM' })
  slot_start: string;

  @IsInt() @Min(1) @Max(8) @IsOptional()
  num_slots?: number;
}
