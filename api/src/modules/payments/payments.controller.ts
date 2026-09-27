import { Body, Controller, Headers, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature?: string,
    @Headers('signature') altSignature?: string,
    @Headers('x-samirpay-signature') samirpaySignature?: string,
    @Body() dto?: WebhookPayloadDto,
  ) {
    const sig = signature || altSignature || samirpaySignature || (req.headers['x-signature'] as string) || (req.headers['signature'] as string) || '';
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(dto || {});
    return this.paymentsService.handleWebhook(rawBody, sig, dto || ({} as WebhookPayloadDto));
  }
}
