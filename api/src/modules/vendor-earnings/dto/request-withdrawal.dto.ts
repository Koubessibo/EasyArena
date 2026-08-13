import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class RequestWithdrawalDto {
  @IsNumber()
  @Min(100)
  @IsNotEmpty()
  amount: number;
}
