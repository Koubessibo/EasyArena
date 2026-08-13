import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './src/modules/users/entities/user.entity';
import { Client } from './src/modules/users/entities/client.entity';
import { Owner } from './src/modules/users/entities/owner.entity';
import { Vendor } from './src/modules/users/entities/vendor.entity';
import * as bcrypt from 'bcrypt';
import { Role, UserStatus } from './src/common/enums';
import { Repository } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
  const clientRepo = app.get<Repository<Client>>(getRepositoryToken(Client));
  const ownerRepo = app.get<Repository<Owner>>(getRepositoryToken(Owner));
  const vendorRepo = app.get<Repository<Vendor>>(getRepositoryToken(Vendor));

  const pin = '1234';
  const pin_hash = await bcrypt.hash(pin, 10);

  const createOrUpdateUser = async (phone: string, role: Role, firstName: string, lastName: string) => {
    let user = await userRepo.findOne({ where: { phone } });
    if (!user) {
      user = userRepo.create({
        phone,
        first_name: firstName,
        last_name: lastName,
        role,
        status: UserStatus.ACTIVE,
        pin_hash,
        must_change_pin: false,
      });
      user = await userRepo.save(user);

      if (role === Role.CLIENT) await clientRepo.save(clientRepo.create({ user }));
      if (role === Role.OWNER) await ownerRepo.save(ownerRepo.create({ user }));
      if (role === Role.VENDOR) await vendorRepo.save(vendorRepo.create({ user, shop_name: 'Boutique Test', contact_phone: '+221772222222', location: 'Dakar' }));
    } else {
      user.pin_hash = pin_hash;
      user.role = role;
      user.status = UserStatus.ACTIVE;
      user.must_change_pin = false;
      await userRepo.save(user);
    }
    console.log(`[OK] ${role} account ready: Phone: ${phone}, PIN: ${pin}`);
  };

  try {
    await createOrUpdateUser('+221771111111', Role.OWNER, 'Test', 'Owner');
    await createOrUpdateUser('+221772222222', Role.VENDOR, 'Test', 'Vendor');
    await createOrUpdateUser('+221773333333', Role.CLIENT, 'Test', 'Client');
    await createOrUpdateUser('+221770000000', Role.ADMIN, 'Super', 'Admin');
  } catch (e) {
    console.error(e);
  }

  await app.close();
}
bootstrap();
