import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { FieldsService } from './fields.service';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { BlockDayDto } from './dto/block-day.dto';
import { BlockSlotDto } from './dto/block-slot.dto';
import { FieldQueryDto } from './dto/field-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fields')
export class FieldsController {
  constructor(private readonly fieldsService: FieldsService) {}

  @Public()
  @Get()
  list(@Query() query: FieldQueryDto) {
    return this.fieldsService.listFields(query);
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.fieldsService.getFieldDetail(id);
  }

  @Public()
  @Get(':id/availability')
  availability(@Param('id') id: string, @Query('date') date: string) {
    return this.fieldsService.getAvailability(id, date);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get('owner/fields')
  getOwnerFields(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    return this.fieldsService.getOwnerFields(
      user.id,
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 50,
    );
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateFieldDto) {
    return this.fieldsService.createField(user.id, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Put(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.fieldsService.updateField(user.id, id, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.fieldsService.deleteField(user.id, id);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  uploadPhoto(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('is_cover') isCover?: string,
  ) {
    return this.fieldsService.uploadPhoto(user.id, id, file, isCover === 'true');
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Delete(':id/photos/:photoId')
  deletePhoto(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.fieldsService.deletePhoto(user.id, id, photoId);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post(':id/schedules')
  createSchedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.fieldsService.createSchedule(user.id, id, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Put(':id/schedules/:scheduleId')
  updateSchedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.fieldsService.updateSchedule(user.id, id, scheduleId, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Delete(':id/schedules/:scheduleId')
  deleteSchedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.fieldsService.deleteSchedule(user.id, id, scheduleId);
  }

  // ── Day blocks ─────────────────────────────────────────────────────────────

  @Public()
  @Get(':id/day-blocks')
  listDayBlocks(
    @Param('id') id: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.fieldsService.listDayBlocksPublic(id, dateFrom, dateTo);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get(':id/day-blocks/manage')
  manageDayBlocks(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.fieldsService.listDayBlocks(user.id, id, dateFrom, dateTo);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post(':id/day-blocks')
  blockDay(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BlockDayDto,
  ) {
    return this.fieldsService.blockDay(user.id, id, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Delete(':id/day-blocks/:blockId')
  unblockDay(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
  ) {
    return this.fieldsService.unblockDay(user.id, id, blockId);
  }

  // ── Slot blocks ────────────────────────────────────────────────────────────

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Get(':id/slot-blocks')
  listSlotBlocks(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('date') date?: string,
  ) {
    return this.fieldsService.listSlotBlocks(user.id, id, date);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Post(':id/slot-blocks')
  blockSlot(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BlockSlotDto,
  ) {
    return this.fieldsService.blockSlot(user.id, id, dto);
  }

  @Roles(Role.OWNER, Role.FIELD_ADMIN, Role.CONTROLLER)
  @Delete(':id/slot-blocks/:blockId')
  unblockSlot(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
  ) {
    return this.fieldsService.unblockSlot(user.id, id, blockId);
  }
}
