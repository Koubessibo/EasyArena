import { Body, Controller, Post } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { CreateEnrollmentRequestDto } from './dto/create-enrollment-request.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Public()
  @Post('requests')
  create(@Body() dto: CreateEnrollmentRequestDto) {
    return this.enrollmentService.create(dto);
  }
}
