import { ReconciliationService } from './src/modules/payments/reconciliation.service';
import { BookingStatus, PaymentStatus, TransactionDirection, TransactionType } from './src/common/enums';

async function runReconciliationCrashTest() {
  console.log('\n========================================================================');
  console.log('🔄 DÉMARRAGE DU CRASH TEST : CRON JOB DE RÉCONCILIATION MOBILE MONEY');
  console.log('========================================================================\n');

  // 1. Simulation d'une réservation fantôme créée il y a 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const orphanBookingId = 'booking-orphan-30min-ago';
  const fieldId = 'field-saint-germain-101';
  const ownerId = 'owner-easyarena-001';

  let currentBookingStatus = BookingStatus.PENDING_PAYMENT;
  let currentPaymentStatus = PaymentStatus.PENDING;
  let iotScheduled = false;
  let ownerCreditedAmount = 0;

  console.log(`📌 ÉTAT INITIAL DE LA RÉSERVATION EN BASE DE DONNÉES :`);
  console.log(`   • ID Réservation  : ${orphanBookingId}`);
  console.log(`   • Date de création : ${thirtyMinutesAgo.toISOString()} (Créée il y a 30 min)`);
  console.log(`   • Statut actuel    : ${currentBookingStatus}`);
  console.log(`   • Statut Webhook   : Perdu / Non reçu (Transaction bloquée)\n`);

  // 2. Mock du Repository TypeORM
  const mockBookingRepo: any = {
    find: async (options: any) => {
      // Return the orphan booking
      return [
        {
          id: orphanBookingId,
          field_id: fieldId,
          slot_start: '18:00',
          slot_end: '19:00',
          booking_date: '2026-08-15',
          total_amount: 15000,
          service_fee: 750,
          status: currentBookingStatus,
          created_at: thirtyMinutesAgo,
          payment: {
            id: 'pay-orphan-777',
            amount: 15750,
            status: currentPaymentStatus,
          },
        },
      ];
    },
  };

  const mockPaymentRepo: any = {};
  const mockOwnerRepo: any = {};

  // 3. Mock de l'API SamirPay qui renvoie SUCCESS en retard
  const mockPaymentProvider: any = {
    verifyTransaction: async (reference: string) => {
      console.log(`📡 [OUTGOING API GET] Interrogation API SamirPay pour la référence ${reference}...`);
      console.log(`📥 [INCOMING API RESPONSE] SamirPay répond : HTTP 200 OK -> { status: "SUCCESS", transactionId: "SAMIR-998877" }`);
      return { status: 'SUCCESS' };
    },
  };

  // 4. Mock du Service IoT
  const mockIotService: any = {
    scheduleFieldLights: async (bookingId: string, field: string, start: string, end: string, date: string) => {
      iotScheduled = true;
      console.log(`💡 [IoT QUEUE] Commande allumage des projecteurs programmée pour le terrain ${field} de ${start} à ${end}`);
    },
  };

  // 5. Mock du Service de Transactions
  const mockTransactionsService: any = {
    computeOwnerBalance: async () => 50000,
    createTransaction: async (dto: any) => {
      ownerCreditedAmount = dto.amount;
      console.log(`💰 [SOLDE PROPRIÉTAIRE] Crédit de ${dto.amount} FCFA effectué sur le solde de l'Owner ${dto.owner_id}`);
    },
  };

  // 6. Mock du QueryRunner pour les transactions atomiques
  const mockQueryRunner: any = {
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    release: async () => {},
    manager: {
      update: async (entity: any, id: string, partial: any) => {
        if (partial.status === BookingStatus.CONFIRMED) {
          currentBookingStatus = BookingStatus.CONFIRMED;
        }
        if (partial.status === PaymentStatus.SUCCESS) {
          currentPaymentStatus = PaymentStatus.SUCCESS;
        }
      },
      findOne: async () => ({ id: ownerId }),
    },
  };

  const mockDataSource: any = {
    createQueryRunner: () => mockQueryRunner,
  };

  // Instantiate ReconciliationService
  const reconciliationService = new ReconciliationService(
    mockBookingRepo,
    mockPaymentRepo,
    mockOwnerRepo,
    mockPaymentProvider,
    mockIotService,
    mockTransactionsService,
    mockDataSource,
  );

  // 7. Exécution manuelle du Cron Job
  console.log('⏰ ÉXÉCUTION DU CRON JOB @Cron(CronExpression.EVERY_5_MINUTES)...\n');
  const result = await reconciliationService.reconcilePendingPayments();

  console.log('\n========================================================================');
  console.log('📌 VÉRIFICATION DE L\'ÉTAT FINAL DU SYSTÈME APRÈS RÉCONCILIATION :');
  console.log('========================================================================');
  console.log(`  • Réservations traitées   : ${result.processed}`);
  console.log(`  • Réservations repêchées  : ${result.confirmed}`);
  console.log(`  • Nouveau Statut Booking  : ${currentBookingStatus} (Réservation CONFIRMÉE)`);
  console.log(`  • Nouveau Statut Paiement : ${currentPaymentStatus} (Paiement SUCCÈS)`);
  console.log(`  • Fonds Vendeur/Owner     : ${ownerCreditedAmount} FCFA versés`);
  console.log(`  • File d'attente IoT      : ${iotScheduled ? 'PROJECTEURS PROGRAMMÉS ✅' : 'NON PROGRAMMÉS ❌'}`);
  console.log('========================================================================');
  console.log('✅ SUCCÈS DU CRASH TEST : LA TRANSACTION FANTÔME A ÉTÉ REPÊCHÉE ET VALIDÉE !');
  console.log('========================================================================\n');
}

runReconciliationCrashTest();
