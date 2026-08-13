import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateEnrollmentRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone: string;

  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsIn(['owner', 'vendor'])
  role: 'owner' | 'vendor';

  // owner fields
  @ValidateIf((o) => o.role === 'owner')
  @IsString()
  @IsNotEmpty()
  field_name?: string;

  @IsString()
  @IsOptional()
  mobile_money?: string;

  @IsString()
  @IsOptional()
  bank_account?: string;

  // vendor fields
  @ValidateIf((o) => o.role === 'vendor')
  @IsString()
  @IsNotEmpty()
  shop_name?: string;

  @ValidateIf((o) => o.role === 'vendor')
  @IsString()
  @IsNotEmpty()
  contact_phone?: string;

  @IsString()
  @IsOptional()
  location?: string;
}
