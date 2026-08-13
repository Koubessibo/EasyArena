import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MoratoriumStepDto {
  @IsNumber()
  @Min(1)
  percentage: number;

  @IsInt()
  @Min(0)
  daysAfter: number;
}

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsInt()
  @Min(1)
  reservations_count: number;

  @IsBoolean()
  allows_moratorium: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoratoriumStepDto)
  moratorium_config?: MoratoriumStepDto[];
}
