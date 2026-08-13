import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Client } from './entities/client.entity';
import { Owner } from './entities/owner.entity';
import { Vendor } from './entities/vendor.entity';
import { Staff } from './entities/staff.entity';
import { UsersService } from './users.service';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Client, Owner, Vendor, Staff]),
    NotificationsModule
  ],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
