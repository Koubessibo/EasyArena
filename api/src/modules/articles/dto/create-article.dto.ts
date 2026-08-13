import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ArticleCategory, ArticleStatus, SportType } from '../../../common/enums';

export class CreateArticleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(ArticleCategory) category: ArticleCategory;
  @IsEnum(SportType) sport_type: SportType;
  @IsNumber() @Min(0) price: number;
  @IsEnum(ArticleStatus) @IsOptional() status?: ArticleStatus;
}
