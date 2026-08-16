import { IsNotEmpty, IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class WithdrawSponsorshipDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  operator: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp_code: string;
}
