import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SportEvent } from './entities/sport-event.entity';
import { CreateEventDto } from './dto/create-event.dto';

import { NotFoundException } from '@nestjs/common';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(SportEvent)
    private readonly eventRepo: Repository<SportEvent>,
  ) {}

  private async cleanupPastEvents(): Promise<void> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await this.eventRepo
        .createQueryBuilder()
        .delete()
        .from(SportEvent)
        .where('date < :todayStr', { todayStr })
        .execute();
    } catch (err) {
      // Ignore cleanup error
    }
  }

  async createEvent(dto: CreateEventDto, ownerId: string): Promise<SportEvent> {
    const event = this.eventRepo.create({
      ...dto,
      owner_id: ownerId,
    });
    
    return this.eventRepo.save(event);
  }

  async getActiveEvents(): Promise<SportEvent[]> {
    await this.cleanupPastEvents();

    return this.eventRepo.find({
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async getOwnerEvents(ownerId: string): Promise<SportEvent[]> {
    await this.cleanupPastEvents();

    return this.eventRepo.find({
      where: { owner_id: ownerId },
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async updateEvent(id: string, dto: Partial<CreateEventDto>, ownerId: string): Promise<SportEvent> {
    const event = await this.eventRepo.findOne({ where: { id, owner_id: ownerId } });
    if (!event) {
      throw new NotFoundException('Événement introuvable ou non autorisé.');
    }

    Object.assign(event, dto);
    return this.eventRepo.save(event);
  }

  async deleteEvent(id: string, ownerId: string): Promise<{ success: boolean }> {
    const result = await this.eventRepo.delete({ id, owner_id: ownerId });
    if (result.affected === 0) {
      throw new NotFoundException('Événement introuvable ou non autorisé.');
    }
    return { success: true };
  }
}
