import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ValidationAction {
  APPROVE = 'approve',
  REJECT = 'reject',
}

export class ValidateWithdrawalDto {
  @IsEnum(ValidationAction) action: ValidationAction;
  @IsString() @IsOptional() rejection_note?: string;
}
