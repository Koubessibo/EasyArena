import { IsDateString, IsOptional, IsString } from 'class-validator';

export class BlockDayDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;
}
