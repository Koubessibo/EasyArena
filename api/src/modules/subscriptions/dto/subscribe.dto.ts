import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SubscribeDto {
  @IsUUID('4', { message: 'plan_id must be a valid UUID' })
  @IsNotEmpty()
  plan_id: string;

  @IsString()
  @IsOptional()
  paymentPhone?: string;

  @IsString()
  @IsOptional()
  operator?: string;
}
