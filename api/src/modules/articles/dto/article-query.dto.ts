import { IsEnum, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ArticleCategory, SportType } from '../../../common/enums';

export class ArticleQueryDto {
  @IsEnum(SportType) @IsOptional() sport_type?: SportType;
  @IsEnum(ArticleCategory) @IsOptional() category?: ArticleCategory;
  @IsString() @IsOptional() vendor_id?: string;
  @IsPositive() @IsOptional() @Type(() => Number) page?: number;
  @IsPositive() @IsOptional() @Type(() => Number) per_page?: number;
}
