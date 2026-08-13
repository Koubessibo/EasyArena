import { IsOptional, IsString, IsIn } from 'class-validator';

export class CreateCancelRequestDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ValidateCancelRequestDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsString()
  @IsOptional()
  rejection_note?: string;
}
