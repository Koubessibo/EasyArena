async function runCrashTest() {
  console.log('\n======================================================');
  console.log('💥 DÉMARRAGE DU CRASH TEST : IOT RETRY LOGIC (SIMULÉ)');
  console.log('======================================================');
  
  const bookingId = 'test-booking-id';
  const fieldId = 'test-field-id';
  const maxAttempts = 5;
  let attempt = 1;

  console.log(`🚀 Ajout du Job 'turn_on' pour le terrain ${fieldId} avec 5 tentatives (backoff exponentiel)`);
  console.log(`⏱️ Job ajouté ! Observe les logs ci-dessous. Le process va échouer 5 fois puis envoyer une alerte critique.\n`);

  const processJob = async () => {
    try {
      console.log(`[DEBUG] Processing turn_on job (Attempt ${attempt}/${maxAttempts}) pour le terrain ${fieldId}`);
      // Simulate network failure
      throw new Error('IoT API Timeout: Relay did not respond');
    } catch (err: any) {
      console.log(`[WARN] Job failed with error: ${err.message}. Attempt ${attempt}/${maxAttempts}`);
      
      if (attempt === maxAttempts) {
        console.log(`\n🚨 CRITICAL_ALERT 🚨: IoT command definitive failure for job. Relay is unreachable after ${maxAttempts} attempts!`);
        console.log(`[MOCK SMS API] 📱 "Alerte: Impossible d'allumer le terrain ${fieldId}. Veuillez l'allumer manuellement pour la réservation ${bookingId}."`);
        
        console.log('\n======================================================');
        console.log('✅ TEST TERMINÉ. Fermeture de l\'application.');
        console.log('======================================================\n');
        process.exit(0);
      } else {
        // Exponential backoff: 2s, 4s, 8s, 16s...
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[INFO] Retrying in ${delay/1000}s...`);
        attempt++;
        setTimeout(processJob, delay);
      }
    }
  };

  await processJob();
}

runCrashTest();
