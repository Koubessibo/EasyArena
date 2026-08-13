import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MobileOperator, WithdrawalMethod } from '../../../common/enums';

export class RequestWithdrawalDto {
  @IsNumber() @Min(50) amount: number;
  @IsEnum(WithdrawalMethod) method: WithdrawalMethod;
  @IsString() @IsNotEmpty() destination: string;
  @IsEnum(MobileOperator) @IsOptional() operator?: MobileOperator;
  @IsString() @IsNotEmpty() otp_code: string;
  @IsString() @IsOptional() rib_url?: string;
}
