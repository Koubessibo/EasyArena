import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FieldStatus, SportType } from '../../../common/enums';
import { CreateScheduleDto } from './create-schedule.dto';

export class CreateFieldDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEnum(SportType) sport_type: SportType;
  @IsString() @IsNotEmpty() address: string;
  @IsNumber() @IsOptional() latitude?: number;
  @IsNumber() @IsOptional() longitude?: number;
  @IsString() @IsOptional() contact_phone?: string;
  @IsString() @IsOptional() contact_email?: string;
  @IsString() @IsOptional() google_maps_url?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() surface_type?: string;
  @IsBoolean() @IsOptional() has_lighting?: boolean;
  @IsBoolean() @IsOptional() has_changing_rooms?: boolean;
  @IsBoolean() @IsOptional() has_parking?: boolean;
  @IsBoolean() @IsOptional() has_cafeteria?: boolean;
  @IsBoolean() @IsOptional() has_wifi?: boolean;
  @IsBoolean() @IsOptional() provides_equipment?: boolean;
  @IsEnum(FieldStatus) @IsOptional() status?: FieldStatus;
  @IsInt() @Min(0) @IsOptional() capacity?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleDto)
  schedules?: CreateScheduleDto[];
}
