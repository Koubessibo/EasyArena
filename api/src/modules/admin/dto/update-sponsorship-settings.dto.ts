import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSponsorshipSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  custom_n1_rate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  custom_n2_rate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  custom_duration_months?: number | null;

  @IsOptional()
  @IsBoolean()
  is_ambassador?: boolean;
}
