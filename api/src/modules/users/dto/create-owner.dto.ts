import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateOwnerDto {
  @IsString() @IsNotEmpty() @Matches(/^\+?[1-9]\d{7,14}$/) phone: string;
  @IsString() @IsNotEmpty() first_name: string;
  @IsString() @IsNotEmpty() last_name: string;
  @IsString() @IsOptional() mobile_money?: string;
  @IsString() @IsOptional() bank_account?: string;
}
