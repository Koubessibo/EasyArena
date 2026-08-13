import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { BookingsService } from './src/modules/bookings/bookings.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './src/modules/users/entities/user.entity';
import { Field } from './src/modules/fields/entities/field.entity';
import { FieldSchedule } from './src/modules/fields/entities/field-schedule.entity';
import { Role, FieldStatus } from './src/common/enums';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Booking } from './src/modules/bookings/entities/booking.entity';

async function bootstrap() {
  // Disable noisy logs for the test
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  
  const bookingsService = app.get(BookingsService);
  const userRepo = app.get(getRepositoryToken(User));
  const scheduleRepo = app.get(getRepositoryToken(FieldSchedule));
  const bookingRepo = app.get(getRepositoryToken(Booking));
  const dataSource = app.get(DataSource);

  const users = await userRepo.find({ where: { role: Role.CLIENT }, take: 5 });
  if (users.length === 0) {
    console.error('No client user found in DB');
    await app.close();
    return;
  }

  const fieldRepo = app.get(getRepositoryToken(Field));
  const field = await fieldRepo.findOne({ where: { status: FieldStatus.AVAILABLE } });
  if (!field) {
    console.error('No AVAILABLE field found in DB');
    await app.close();
    return;
  }
  const schedule = await scheduleRepo.findOne({ where: { field_id: field.id } });

  // We will use tomorrow's date to avoid any existing past conflicts
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];
  const slotStart = '20:00';

  // Clean up any existing bookings for this exact slot just in case
  await bookingRepo.delete({
    field_id: schedule.field_id,
    schedule_id: schedule.id,
    booking_date: bookingDate,
    slot_start: slotStart
  });

  const dto = {
    field_id: schedule.field_id,
    schedule_id: schedule.id,
    booking_date: bookingDate,
    slot_start: slotStart,
    num_slots: 1
  };

  console.log('\n======================================================');
  console.log('💥 DÉMARRAGE DU CRASH TEST : CONCURRENCE DE RÉSERVATION');
  console.log('======================================================');
  console.log(`👤 Clients: ${users.length} utilisateurs différents`);
  console.log(`🏟️  Terrain ID: ${schedule.field_id}`);
  console.log(`📅 Date: ${bookingDate} | ⏰ Créneau: ${slotStart}`);
  console.log(`🚀 Lancement de 5 requêtes simultanées... (Promise.all)`);
  console.log('------------------------------------------------------\n');

  const promises: any[] = [];
  for (let i = 0; i < 5; i++) {
    // If we don't have 5 users, we recycle them, but to get 409 we need different users or just one user that isn't matched by ownPending (which we just fixed to include PENDING_PAYMENT)
    const userToUse = users[i % users.length];
    promises.push(
      bookingsService.createBooking(userToUse as any, dto as any)
        .then(res => `[Requête ${i+1} - User ${userToUse.id.slice(-4)}] 🟢 SUCCÈS (Status 201) - Réservation ID: ${res?.id || 'Inconnu'}`)
        .catch(err => `[Requête ${i+1} - User ${userToUse.id.slice(-4)}] 🔴 ÉCHEC (Status ${err.status || 409}) - ${err.message}`)
    );
  }

  const results = await Promise.all(promises);
  results.forEach(res => console.log(res));
  
  console.log('\n======================================================');
  console.log('✅ TEST TERMINÉ. Analyse des résultats ci-dessus.');
  console.log('======================================================\n');

  // Clean up
  await bookingRepo.delete({
    field_id: schedule.field_id,
    schedule_id: schedule.id,
    booking_date: bookingDate,
    slot_start: slotStart
  });

  await app.close();
}

bootstrap();
