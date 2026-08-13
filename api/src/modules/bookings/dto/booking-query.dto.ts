import { IsDateString, IsEnum, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '../../../common/enums';

export class BookingQueryDto {
  @IsEnum(BookingStatus) @IsOptional() status?: BookingStatus;
  @IsString() @IsOptional() field_id?: string;
  @IsDateString() @IsOptional() date?: string;
  @IsPositive() @IsOptional() @Type(() => Number) page?: number;
  @IsPositive() @IsOptional() @Type(() => Number) per_page?: number;
}
