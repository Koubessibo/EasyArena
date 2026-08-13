import { IsNotEmpty, IsString } from 'class-validator';

export class WebhookPayloadDto {
  @IsString() @IsNotEmpty() order_id: string;
  @IsString() @IsNotEmpty() transaction_id: string;
  @IsString() @IsNotEmpty() status: string;
}
