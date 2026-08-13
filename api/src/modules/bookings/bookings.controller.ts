import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
import { CreateCancelRequestDto, ValidateCancelRequestDto } from './dto/cancel-request.dto';
import { PaymentsService } from '../payments/payments.service';
import { InitiatePaymentDto } from '../payments/dto/initiate-payment.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Roles(Role.CLIENT)
  @Post('bookings')
  create(@CurrentUser() user: User, @Body() dto: CreateBookingDto) {
    return this.bookingsService.createBooking(user, dto);
  }

  @Roles(Role.CLIENT)
  @Get('bookings')
  getMyBookings(@CurrentUser() user: User, @Query() query: BookingQueryDto) {
    return this.bookingsService.getClientBookings(user, query);
  }

  @Roles(Role.CLIENT, Role.OWNER, Role.ADMIN)
  @Get('bookings/:id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.getBookingById(user, id);
  }

  // ── Cancellation requests ──────────────────────────────────────────────

  @Roles(Role.CLIENT)
  @Post('bookings/:id/cancel-request')
  requestCancellation(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateCancelRequestDto,
  ) {
    return this.bookingsService.requestCancellation(user, id, dto);
  }

  @Roles(Role.CLIENT)
  @Get('bookings/:id/cancel-request')
  getCancellationRequest(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.getCancellationRequest(user, id);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('owner/cancellation-requests')
  getOwnerCancellationRequests(@CurrentUser() user: User) {
    return this.bookingsService.getOwnerCancellationRequests(user);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Put('owner/cancellation-requests/:id/validate')
  validateCancellationRequest(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ValidateCancelRequestDto,
  ) {
    return this.bookingsService.validateCancellationRequest(user, id, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('owner/bookings')
  getOwnerBookings(@CurrentUser() user: User, @Query() query: BookingQueryDto) {
    return this.bookingsService.getOwnerBookings(user, query);
  }

  @Roles(Role.CLIENT)
  @Post('bookings/:id/payment')
  initiatePayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(user, id, dto);
  }
}
