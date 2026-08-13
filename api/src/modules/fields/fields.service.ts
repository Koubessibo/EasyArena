import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { Field } from './entities/field.entity';
import { FieldSchedule } from './entities/field-schedule.entity';
import { FieldPhoto } from './entities/field-photo.entity';
import { FieldDayBlock } from './entities/field-day-block.entity';
import { FieldSlotBlock } from './entities/field-slot-block.entity';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { BlockDayDto } from './dto/block-day.dto';
import { BlockSlotDto } from './dto/block-slot.dto';
import { FieldQueryDto } from './dto/field-query.dto';
import { FieldStatus } from '../../common/enums';
import { Booking } from '../bookings/entities/booking.entity';
import { StorageService } from '../storage/storage.service';
import { Owner } from '../users/entities/owner.entity';

@Injectable()
export class FieldsService {
  constructor(
    @InjectRepository(Field) private readonly fieldRepo: Repository<Field>,
    @InjectRepository(FieldSchedule) private readonly scheduleRepo: Repository<FieldSchedule>,
    @InjectRepository(FieldPhoto) private readonly photoRepo: Repository<FieldPhoto>,
    @InjectRepository(FieldDayBlock) private readonly dayBlockRepo: Repository<FieldDayBlock>,
    @InjectRepository(FieldSlotBlock) private readonly slotBlockRepo: Repository<FieldSlotBlock>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Owner) private readonly ownerRepo: Repository<Owner>,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  async listFields(query: FieldQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;

    const qb = this.fieldRepo
      .createQueryBuilder('field')
      .leftJoinAndSelect('field.photos', 'photo')
      .leftJoinAndSelect('field.schedules', 'schedule')
      .where('field.status = :status', { status: FieldStatus.AVAILABLE });

    if (query.sport_type) {
      qb.andWhere('field.sport_type = :sport', { sport: query.sport_type });
    }
    if (query.min_price !== undefined) {
      qb.andWhere('schedule.price_per_slot >= :min', { min: query.min_price });
    }
    if (query.max_price !== undefined) {
      qb.andWhere('schedule.price_per_slot <= :max', { max: query.max_price });
    }

    qb.skip((page - 1) * perPage).take(perPage);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, total, page, per_page: perPage };
  }

  async getFieldDetail(id: string) {
    const field = await this.fieldRepo.findOne({
      where: { id },
      relations: ['schedules', 'photos', 'owner', 'owner.user'],
    });
    if (!field) throw new NotFoundException('Field not found');
    return field;
  }

  async getAvailability(fieldId: string, date: string) {
    const field = await this.fieldRepo.findOne({ where: { id: fieldId } });
    if (!field) throw new NotFoundException('Field not found');

    // Check day block first
    const dayBlock = await this.dayBlockRepo.findOne({
      where: { field_id: fieldId, blocked_date: date },
    });

    const schedule = await this.scheduleRepo.findOne({ where: { field_id: fieldId } });
    if (!schedule) {
      return { date, field_id: fieldId, day_blocked: !!dayBlock, schedules: [] };
    }

    const confirmedBookings = await this.bookingRepo.find({
      where: { field_id: fieldId, booking_date: date, status: 'confirmed' as any },
    });
    const bookedSlots = new Set(confirmedBookings.map((b) => b.slot_start));

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowMinutes = date === todayStr ? now.getHours() * 60 + now.getMinutes() : null;

    // Blocked slots for this date
    const slotBlocks = await this.slotBlockRepo.find({
      where: { field_id: fieldId, blocked_date: date },
    });
    const blockedSlotSet = new Set(slotBlocks.map((b) => b.slot_start));

    const slots = this.generateSlots(
      schedule.open_at,
      schedule.close_at,
      schedule.slot_duration_min,
      schedule.price_per_slot,
      bookedSlots,
      blockedSlotSet,
      nowMinutes,
      schedule.deposit_per_slot ?? null,
      !!dayBlock,
    );

    return {
      date,
      field_id: fieldId,
      day_blocked: !!dayBlock,
      schedules: [{ schedule_id: schedule.id, slots }],
    };
  }

  async getOwnerFields(userId: string, page = 1, perPage = 20) {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: userId } } });
    if (!owner) return { data: [], total: 0, page, per_page: perPage };

    const [data, total] = await this.fieldRepo.findAndCount({
      where: { owner_id: owner.id },
      relations: ['schedules', 'photos'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { data, total, page, per_page: perPage };
  }

  async createField(ownerId: string, dto: CreateFieldDto) {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerId } } });
    if (!owner) throw new NotFoundException('Owner profile not found');

    return this.dataSource.transaction(async (manager) => {
      const field = await manager.save(
        manager.create(Field, {
          owner_id: owner.id,
          name: dto.name,
          sport_type: dto.sport_type,
          address: dto.address,
          latitude: dto.latitude ?? 0,
          longitude: dto.longitude ?? 0,
          contact_phone: dto.contact_phone ?? owner.user?.phone ?? undefined,
          contact_email: dto.contact_email ?? owner.user?.email ?? undefined,
          google_maps_url: dto.google_maps_url ?? undefined,
          description: dto.description,
          surface_type: dto.surface_type ?? 'synthetic_turf',
          has_lighting: dto.has_lighting ?? true,
          has_changing_rooms: dto.has_changing_rooms ?? true,
          has_parking: dto.has_parking ?? true,
          has_cafeteria: dto.has_cafeteria ?? false,
          has_wifi: dto.has_wifi ?? false,
          provides_equipment: dto.provides_equipment ?? true,
          capacity: dto.capacity ?? 0,
          status: dto.status ?? FieldStatus.AVAILABLE,
        }),
      );

      if (dto.schedules?.length) {
        // Only the first schedule is used (one per field)
        const s = dto.schedules[0];
        await manager.save(manager.create(FieldSchedule, { ...s, field_id: field.id }));
      }

      return manager.findOne(Field, {
        where: { id: field.id },
        relations: ['schedules', 'photos'],
      });
    });
  }

  async updateField(userId: string, fieldId: string, dto: UpdateFieldDto) {
    const field = await this.verifyOwnership(userId, fieldId);
    const { schedules, ...fieldData } = dto;
    Object.assign(field, fieldData);
    await this.fieldRepo.save(field);

    if (schedules?.length) {
      const existing = await this.scheduleRepo.find({ where: { field_id: field.id } });
      const s = schedules[0];
      if (existing.length > 0) {
        const primary = existing[0];
        Object.assign(primary, s);
        await this.scheduleRepo.save(primary);
        for (const extra of existing.slice(1)) {
          try { await this.scheduleRepo.delete(extra.id); } catch { /* FK RESTRICT — laisser */ }
        }
      } else {
        await this.scheduleRepo.save(this.scheduleRepo.create({ ...s, field_id: field.id }));
      }
    }

    return this.fieldRepo.findOne({
      where: { id: field.id },
      relations: ['schedules', 'photos'],
    });
  }

  async deleteField(userId: string, fieldId: string) {
    const field = await this.verifyOwnership(userId, fieldId);
    await this.fieldRepo.softRemove(field);
    return { message: 'Field deleted' };
  }

  async uploadPhoto(userId: string, fieldId: string, file: Express.Multer.File, isCover: boolean) {
    await this.verifyOwnership(userId, fieldId);
    if (!file || !file.buffer) {
      throw new BadRequestException('Fichier de photo manquant ou invalide');
    }
    const path = this.storageService.buildPath('fields', fieldId, file.originalname || 'photo.jpg');
    const url = await this.storageService.uploadFile(path, file.buffer, file.mimetype || 'image/jpeg');

    if (isCover) {
      await this.photoRepo.update({ field_id: fieldId }, { is_cover: false });
    }

    const photo = await this.photoRepo.save(
      this.photoRepo.create({ field_id: fieldId, url, is_cover: isCover }),
    );
    return photo;
  }

  async deletePhoto(userId: string, fieldId: string, photoId: string) {
    await this.verifyOwnership(userId, fieldId);
    const photo = await this.photoRepo.findOne({ where: { id: photoId, field_id: fieldId } });
    if (!photo) throw new NotFoundException('Photo not found');

    const storagePath = this.storageService.extractPathFromUrl(photo.url);
    if (storagePath) await this.storageService.deleteFile(storagePath);

    await this.photoRepo.remove(photo);
    return { message: 'Photo deleted' };
  }

  async createSchedule(userId: string, fieldId: string, dto: CreateScheduleDto) {
    await this.verifyOwnership(userId, fieldId);

    const schedules = await this.scheduleRepo.find({ where: { field_id: fieldId } });

    if (schedules.length > 0) {
      const primary = schedules[0];
      Object.assign(primary, dto);
      const saved = await this.scheduleRepo.save(primary);

      for (const s of schedules.slice(1)) {
        try {
          await this.scheduleRepo.delete(s.id);
        } catch {
          // Referenced by bookings (FK RESTRICT) — leave it
        }
      }

      return saved;
    }

    return this.scheduleRepo.save(
      this.scheduleRepo.create({ ...dto, field_id: fieldId }),
    );
  }

  async updateSchedule(userId: string, fieldId: string, scheduleId: string, dto: UpdateScheduleDto) {
    await this.verifyOwnership(userId, fieldId);
    const schedule = await this.scheduleRepo.findOne({
      where: { id: scheduleId, field_id: fieldId },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    Object.assign(schedule, dto);
    return this.scheduleRepo.save(schedule);
  }

  async deleteSchedule(userId: string, fieldId: string, scheduleId: string) {
    await this.verifyOwnership(userId, fieldId);
    const schedule = await this.scheduleRepo.findOne({
      where: { id: scheduleId, field_id: fieldId },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    await this.scheduleRepo.remove(schedule);
    return { message: 'Schedule deleted' };
  }

  // ── Day blocks ─────────────────────────────────────────────────────────────

  async listDayBlocksPublic(fieldId: string, dateFrom?: string, dateTo?: string) {
    const where: any = { field_id: fieldId };
    if (dateFrom && dateTo) where.blocked_date = Between(dateFrom, dateTo);
    else if (dateFrom) where.blocked_date = Between(dateFrom, '9999-12-31');
    return this.dayBlockRepo.find({ where, order: { blocked_date: 'ASC' } });
  }

  async listDayBlocks(userId: string, fieldId: string, dateFrom?: string, dateTo?: string) {
    await this.verifyOwnership(userId, fieldId);
    return this.listDayBlocksPublic(fieldId, dateFrom, dateTo);
  }

  async blockDay(userId: string, fieldId: string, dto: BlockDayDto) {
    await this.verifyOwnership(userId, fieldId);
    const existing = await this.dayBlockRepo.findOne({
      where: { field_id: fieldId, blocked_date: dto.date },
    });
    if (existing) throw new ConflictException('Ce jour est déjà bloqué');
    return this.dayBlockRepo.save(
      this.dayBlockRepo.create({ field_id: fieldId, blocked_date: dto.date, note: dto.note ?? null }),
    );
  }

  async unblockDay(userId: string, fieldId: string, blockId: string) {
    await this.verifyOwnership(userId, fieldId);
    const block = await this.dayBlockRepo.findOne({ where: { id: blockId, field_id: fieldId } });
    if (!block) throw new NotFoundException('Blocage introuvable');
    await this.dayBlockRepo.remove(block);
    return { message: 'Jour débloqué' };
  }

  // ── Slot blocks ────────────────────────────────────────────────────────────

  async listSlotBlocks(userId: string, fieldId: string, date?: string) {
    await this.verifyOwnership(userId, fieldId);
    const where: any = { field_id: fieldId };
    if (date) where.blocked_date = date;
    return this.slotBlockRepo.find({ where, order: { blocked_date: 'ASC', slot_start: 'ASC' } });
  }

  async blockSlot(userId: string, fieldId: string, dto: BlockSlotDto) {
    await this.verifyOwnership(userId, fieldId);
    const existing = await this.slotBlockRepo.findOne({
      where: { field_id: fieldId, blocked_date: dto.date, slot_start: dto.slot_start },
    });
    if (existing) throw new ConflictException('Ce créneau est déjà bloqué');
    return this.slotBlockRepo.save(
      this.slotBlockRepo.create({ field_id: fieldId, blocked_date: dto.date, slot_start: dto.slot_start }),
    );
  }

  async unblockSlot(userId: string, fieldId: string, blockId: string) {
    await this.verifyOwnership(userId, fieldId);
    const block = await this.slotBlockRepo.findOne({ where: { id: blockId, field_id: fieldId } });
    if (!block) throw new NotFoundException('Blocage introuvable');
    await this.slotBlockRepo.remove(block);
    return { message: 'Créneau débloqué' };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async verifyOwnership(userId: string, fieldId: string): Promise<Field> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: userId } } });
    if (!owner) throw new NotFoundException('Field not found');
    const field = await this.fieldRepo.findOne({ where: { id: fieldId, owner_id: owner.id } });
    if (!field) throw new NotFoundException('Field not found');
    return field;
  }

  private generateSlots(
    openAt: string,
    closeAt: string,
    durationMin: number,
    price: number,
    bookedSlots: Set<string>,
    blockedSlots: Set<string>,
    nowMinutes: number | null,
    depositPerSlot: number | null,
    dayBlocked: boolean,
  ): Array<{ slot_start: string; slot_end: string; available: boolean; blocked: boolean; price: number; deposit_per_slot: number | null }> {
    const slots: Array<{ slot_start: string; slot_end: string; available: boolean; blocked: boolean; price: number; deposit_per_slot: number | null }> = [];
    const [oh, om] = openAt.split(':').map(Number);
    const [ch, cm] = closeAt.split(':').map(Number);
    let current = oh * 60 + om;
    let end = ch * 60 + cm;

    // Support midnight crossing (e.g. open 22:00, close 03:00)
    if (end <= current) end += 1440;

    while (current + durationMin <= end) {
      const startStr = this.minutesToTime(current % 1440);
      const endStr = this.minutesToTime((current + durationMin) % 1440);
      const isPast = nowMinutes !== null && current < 1440 && current < nowMinutes;
      const isBlocked = dayBlocked || blockedSlots.has(startStr);
      const isBooked = bookedSlots.has(startStr);
      slots.push({
        slot_start: startStr,
        slot_end: endStr,
        available: !isPast && !isBlocked && !isBooked,
        blocked: isBlocked,
        price,
        deposit_per_slot: depositPerSlot,
      });
      current += durationMin;
    }
    return slots;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
