import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import {
  TransactionDirection,
  TransactionSourceType,
  TransactionType,
} from '../../common/enums';

export interface CreateTransactionParams {
  owner_id: string;
  type: TransactionType;
  direction: TransactionDirection;
  amount: number;
  balance_before: number;
  source_id: string;
  source_type: TransactionSourceType;
  description?: string;
}

/** Format de période attendu par `getOwnerTransactions` (date civile). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Décrit une réservation sans imposer de relations chargées. */
export interface BookingDescriptionInput {
  id: string;
  booking_date?: string | Date | null;
  slot_start?: string | null;
  field?: { name?: string | null } | null;
  client?: {
    user?: { first_name?: string | null; last_name?: string | null } | null;
  } | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async createTransaction(
    params: CreateTransactionParams,
    manager: EntityManager,
  ): Promise<Transaction> {
    const balance_after =
      params.direction === TransactionDirection.CREDIT
        ? Number(params.balance_before) + Number(params.amount)
        : Number(params.balance_before) - Number(params.amount);

    const reference = await this.generateReference(manager);

    const tx = manager.create(Transaction, {
      owner_id: params.owner_id,
      type: params.type,
      direction: params.direction,
      amount: params.amount,
      balance_before: params.balance_before,
      balance_after,
      reference,
      source_id: params.source_id,
      source_type: params.source_type,
      description: params.description,
    });

    return manager.save(Transaction, tx);
  }

  async getOwnerTransactions(
    ownerId: string,
    page = 1,
    perPage = 20,
    startDate?: string,
    endDate?: string,
  ): Promise<{ data: Transaction[]; total: number; page: number; per_page: number }> {
    const qb = this.txRepo.createQueryBuilder('tx')
      .where('tx.owner_id = :ownerId', { ownerId });

    // Bornes de période : PAS de `new Date()` + `setHours()` en heure locale.
    //
    // `created_at` est écrit par l'horloge PostgreSQL (UTC) dans une colonne
    // TIMESTAMP sans fuseau. Un `Date` JS est sérialisé par le driver en heure
    // LOCALE avec son offset, que PostgreSQL jette ensuite pour ce type de
    // colonne : la borne partait de 12 h sur un hôte non-UTC, et filtrer le
    // 13 août renvoyait l'après-midi du 12.
    //
    // On laisse PostgreSQL interpréter la date civile : CAST(:d AS date) →
    // 00:00:00, + 1 jour exclusive pour la borne haute. Aucun Date JS n'est
    // lié, donc aucun décalage possible quelle que soit la TZ du processus.
    if (startDate !== undefined && startDate !== '') {
      if (!ISO_DATE.test(startDate)) {
        throw new BadRequestException('start_date doit être au format YYYY-MM-DD');
      }
      qb.andWhere('tx.created_at >= CAST(:startDate AS date)', { startDate });
    }
    if (endDate !== undefined && endDate !== '') {
      if (!ISO_DATE.test(endDate)) {
        throw new BadRequestException('end_date doit être au format YYYY-MM-DD');
      }
      qb.andWhere(
        `tx.created_at < CAST(:endDate AS date) + INTERVAL '1 day'`,
        { endDate },
      );
    }

    qb.orderBy('tx.created_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, per_page: perPage };
  }

  async computeOwnerBalance(ownerId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(Transaction) : this.txRepo;
    const result = await repo
      .createQueryBuilder('tx')
      .select("SUM(CASE WHEN tx.direction = 'CREDIT' THEN tx.amount ELSE -tx.amount END)", 'balance')
      .where('tx.owner_id = :ownerId', { ownerId })
      .getRawOne();
    return Number(result?.balance ?? 0);
  }

  /**
   * Libellé lisible d'une écriture liée à une réservation.
   *
   * Le journal partenaire affichait `Booking <uuid> confirmed` : 29 des 55
   * lignes existantes ne contenaient qu'un identifiant brut, inexploitable
   * pour un gérant. On restitue terrain, client et créneau quand les
   * relations sont chargées, en gardant une référence courte (#a1b2c3d4)
   * pour le support — et en retombant proprement sur l'id si aucune
   * relation n'est disponible.
   *
   * Aucune arithmétique de date : on découpe la chaîne `YYYY-MM-DD`, donc
   * indépendant de la TZ du processus (cf. P0-2 du rapport de premortem).
   */
  bookingDescription(
    booking: BookingDescriptionInput,
    suffix?: string,
  ): string {
    const parts: string[] = [];

    const terrain = booking.field?.name;
    if (terrain) parts.push(`Terrain "${terrain}"`);

    const user = booking.client?.user;
    const client = [user?.first_name, user?.last_name]
      .filter((x): x is string => Boolean(x))
      .join(' ')
      .trim();
    if (client) parts.push(client);

    const date = this.civilDate(booking.booking_date);
    if (date) {
      parts.push(booking.slot_start ? `${date} à ${booking.slot_start}` : date);
    }

    if (parts.length === 0) {
      parts.push(`Réservation ${booking.id}`);
    } else {
      parts.push(`#${booking.id.slice(0, 8)}`);
    }

    const base = parts.join(' — ');
    return suffix ? `${base} — ${suffix}` : base;
  }

  /** `2026-08-13` → `13/08/2026` ; sans conversion de fuseau. */
  private civilDate(value?: string | Date | null): string {
    if (!value) return '';
    const raw =
      typeof value === 'string'
        ? value
        : value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value);
    const [y, m, d] = raw.split('-');
    return y && m && d ? `${d}/${m}/${y}` : raw;
  }

  private async generateReference(manager: EntityManager): Promise<string> {
    // Date en UTC : le préfixe du journal suit l'horloge de référence, pas le
    // fuseau du processus (qui peut être indéfini sur un hôte Windows).
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Ancien schéma `TXN-{jour}-{count+1}` : deux écritures simultanées le
    // même jour calculaient le même `count`, généraient la même référence et
    // butaient sur `UNIQUE(reference)` — soit une transaction NON écrite, le
    // partenaire ne voyait alors plus cet argent.
    //
    // 6 hex = 16,7 M de combinaisons par jour ; on vérifie quand même en base
    // (indexé sur `reference`, donc moins coûteux que l'ancien `count(*)`
    // complet) et on retente avec un nouvel aléatoire en cas de collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = `TXN-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const clash = await manager.findOne(Transaction, { where: { reference } });
      if (!clash) return reference;
    }

    throw new Error('Impossible de générer une référence de transaction unique.');
  }
}
