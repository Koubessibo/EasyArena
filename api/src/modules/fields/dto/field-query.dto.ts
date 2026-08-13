import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SportType } from '../../../common/enums';

export class FieldQueryDto {
  @IsEnum(SportType) @IsOptional() sport_type?: SportType;
  @IsDateString() @IsOptional() date?: string;
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number) min_price?: number;
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number) max_price?: number;
  @IsNumber() @IsPositive() @IsOptional() @Type(() => Number) page?: number;
  @IsNumber() @IsPositive() @IsOptional() @Type(() => Number) per_page?: number;
}
