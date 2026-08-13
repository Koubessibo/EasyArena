import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateVendorDto {
  @IsString() @IsNotEmpty() @Matches(/^\+?[1-9]\d{7,14}$/) phone: string;
  @IsString() @IsNotEmpty() first_name: string;
  @IsString() @IsNotEmpty() last_name: string;
  @IsString() @IsNotEmpty() shop_name: string;
  @IsString() @IsNotEmpty() @Matches(/^\+?[1-9]\d{7,14}$/) contact_phone: string;
  @IsString() @IsOptional() location?: string;
}
