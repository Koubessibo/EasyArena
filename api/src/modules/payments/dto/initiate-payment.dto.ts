import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MobileOperator, PaymentMethod } from '../../../common/enums';

export class InitiatePaymentDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsEnum(MobileOperator) operator: MobileOperator;
  @IsString() @IsOptional() phone?: string;
  @IsOptional() @IsNumber() @Min(1) paid_amount?: number;
}
