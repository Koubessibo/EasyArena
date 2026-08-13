import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Field } from './entities/field.entity';
import { FieldSchedule } from './entities/field-schedule.entity';
import { FieldPhoto } from './entities/field-photo.entity';
import { FieldsService } from './fields.service';
import { FieldsController } from './fields.controller';
import { Booking } from '../bookings/entities/booking.entity';
import { FieldDayBlock } from './entities/field-day-block.entity';
import { FieldSlotBlock } from './entities/field-slot-block.entity';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Field, FieldSchedule, FieldPhoto, Booking, FieldDayBlock, FieldSlotBlock]),
    StorageModule,
    UsersModule,
  ],
  providers: [FieldsService],
  controllers: [FieldsController],
  exports: [FieldsService, TypeOrmModule],
})
export class FieldsModule {}
