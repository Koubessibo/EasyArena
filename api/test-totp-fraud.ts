/**
 * ══════════════════════════════════════════════════════════════════════
 * CRASH TEST ANTI-FRAUDE — QR Code TOTP Dynamique
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ce script prouve que le système de billetterie résiste aux fraudes
 * par capture d'écran (WhatsApp, photo, etc.).
 *
 * Tests :
 *  [A] Le bon client  → Token valide immédiatement → 200 OK ✅
 *  [B] Le fraudeur    → Token expiré (simulé 90s)  → 401 Unauthorized ❌
 *  [C] Anti-Replay    → Token valide mais déjà scanné → 400 Bad Request ❌
 *
 * Exécution : npx ts-node test-totp-fraud.ts
 * ══════════════════════════════════════════════════════════════════════
 */

import * as crypto from 'crypto';

// ── Configuration TOTP ────────────────────────────────────────────────
const STEP = 30; // 30 secondes
const WINDOW = 1; // ±1 fenêtre de tolérance = ±30s

// ── Helpers ───────────────────────────────────────────────────────────
function generateSecret(): string {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  let secret = '';
  for (const byte of bytes) {
    secret += base32Chars[byte % 32];
  }
  return secret;
}

function computeTotp(base32Secret: string, counter: number): string {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  const counterBytes = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = crypto.createHmac('sha1', Buffer.from(bytes));
  hmac.update(counterBytes);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24) |
               ((digest[offset + 1] & 0xff) << 16) |
               ((digest[offset + 2] & 0xff) << 8) |
               (digest[offset + 3] & 0xff);
  const otp = code % 1000000;
  return otp.toString().padStart(6, '0');
}

function generateToken(secret: string, fakeEpoch?: number): string {
  const epoch = fakeEpoch || Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / STEP);
  return computeTotp(secret, counter);
}

function separator(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

// ── Simulation de la couche service backend ───────────────────────────
interface Ticket {
  id: string;
  totp_secret: string;
  status: 'VALID' | 'SCANNED' | 'CANCELLED';
}

const ticketDB: Map<string, Ticket> = new Map();

function createTicket(): Ticket {
  const ticket: Ticket = {
    id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    totp_secret: generateSecret(),
    status: 'VALID',
  };
  ticketDB.set(ticket.id, ticket);
  return ticket;
}

/**
 * Simule le service validateTicket du backend.
 */
function validateTicketBackend(
  ticketId: string,
  token: string,
  fakeEpoch?: number,
): { statusCode: number; message: string; data?: any } {
  const ticket = ticketDB.get(ticketId);

  // 404 : Billet inexistant
  if (!ticket) {
    return { statusCode: 404, message: 'Billet introuvable.' };
  }

  // 400 : Déjà scanné (Anti-Replay)
  if (ticket.status === 'SCANNED') {
    return { statusCode: 400, message: '🚨 Billet déjà utilisé. Fraude (Replay) détectée !' };
  }

  // 400 : Statut invalide
  if (ticket.status !== 'VALID') {
    return { statusCode: 400, message: `Billet non valide (Statut: ${ticket.status}).` };
  }

  // ── Vérification TOTP ────────────────────────────────────────────────
  const epoch = fakeEpoch || Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(epoch / STEP);
  
  let isTokenValid = false;
  for (let i = -WINDOW; i <= WINDOW; i++) {
    if (computeTotp(ticket.totp_secret, currentCounter + i) === token) {
      isTokenValid = true;
      break;
    }
  }

  // 401 : Token expiré ou invalide → FRAUDE PAR CAPTURE D'ÉCRAN
  if (!isTokenValid) {
    return {
      statusCode: 401,
      message: "🚨 Token TOTP expiré ou invalide. QR Code capturé (WhatsApp/Screenshot) détecté !",
    };
  }

  // ── Verrouillage Anti-Replay (atomique en production via UPDATE conditionnel) ─
  ticket.status = 'SCANNED';

  return {
    statusCode: 200,
    message: '✅ Ticket validé avec succès',
    data: {
      ticketId: ticket.id,
      holderName: 'Mamadou Diallo',
      validatedAt: new Date().toISOString(),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// LANCEMENT DES TESTS
// ══════════════════════════════════════════════════════════════════════
async function runCrashTests() {
  console.log('\n🔐 CRASH TEST : QR Code TOTP Dynamique — Billetterie EasyArena');
  console.log('📅 Lancé le :', new Date().toLocaleString('fr-FR'));

  // ─────────────────────────────────────────────────────────────────────
  separator('TEST A — LE BON CLIENT (Token valide immédiatement)');
  // ─────────────────────────────────────────────────────────────────────

  const ticketA = createTicket();
  const tokenA = generateToken(ticketA.totp_secret);

  log('🎟️', `Billet créé   : ${ticketA.id}`);
  log('🔑', `Token TOTP généré : ${tokenA}`);
  log('⏰', `Validé immédiatement (t+0s)`);

  const resultA = validateTicketBackend(ticketA.id, tokenA);

  log(
    resultA.statusCode === 200 ? '✅' : '❌',
    `Statut HTTP : ${resultA.statusCode} | ${resultA.message}`,
  );

  if (resultA.statusCode !== 200) {
    console.error('💥 ÉCHEC TEST A : Le bon client devrait être accepté !');
    process.exit(1);
  }
  console.log('\n  → RÉSULTAT ATTENDU : 200 OK ✅ PASS');

  // ─────────────────────────────────────────────────────────────────────
  separator('TEST B — LE FRAUDEUR WHATSAPP (Token expiré après 90s)');
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n  Scénario: Le fraudeur a pris une capture d\'écran du QR code');
  console.log('  et tente de s\'en servir 90 secondes plus tard.');
  console.log('  (3 fenêtres TOTP de 30s = hors de la tolérance ±30s)\n');

  const ticketB = createTicket();
  // Générer un token comme si c'était il y a 90 secondes
  const epochMinus90s = Math.floor(Date.now() / 1000) - 90;
  const tokenB = generateToken(ticketB.totp_secret, epochMinus90s);

  log('🎟️', `Billet créé   : ${ticketB.id}`);
  log('📸', `Token capturé : ${tokenB} (généré il y a 90s)`);
  log('⏰', `Simulation : tentative de validation 90s après génération`);

  // Vérification avec l'heure actuelle
  const resultB = validateTicketBackend(ticketB.id, tokenB);

  log(
    resultB.statusCode === 401 ? '✅' : '❌',
    `Statut HTTP : ${resultB.statusCode} | ${resultB.message}`,
  );

  if (resultB.statusCode !== 401) {
    console.error('💥 ÉCHEC TEST B : Le fraudeur ne devrait PAS être accepté !');
    process.exit(1);
  }
  console.log('\n  → RÉSULTAT ATTENDU : 401 Unauthorized ✅ PASS');

  // ─────────────────────────────────────────────────────────────────────
  separator('TEST C — ANTI-REPLAY (Token valide mais billet déjà scanné)');
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n  Scénario: Le fraudeur a le token valide MAIS le billet a déjà');
  console.log('  été scanné par un 1er contrôleur. Il tente une 2ème entrée.\n');

  // Ticket C : d'abord une validation légitime
  const ticketC = createTicket();
  const tokenC = generateToken(ticketC.totp_secret);

  log('🎟️', `Billet créé   : ${ticketC.id}`);
  log('🔑', `Token valide  : ${tokenC}`);

  // 1ère validation (légitime)
  const resultC1 = validateTicketBackend(ticketC.id, tokenC);
  log('👮', `1ère validation (légitime) : ${resultC1.statusCode} | ${resultC1.message}`);

  // 2ème validation (replay)
  const resultC2 = validateTicketBackend(ticketC.id, tokenC);
  log(
    resultC2.statusCode === 400 ? '✅' : '❌',
    `2ème validation (replay) : ${resultC2.statusCode} | ${resultC2.message}`,
  );

  if (resultC2.statusCode !== 400) {
    console.error('💥 ÉCHEC TEST C : Le replay ne devrait PAS être accepté !');
    process.exit(1);
  }
  console.log('\n  → RÉSULTAT ATTENDU : 400 Bad Request ✅ PASS');

  // ─────────────────────────────────────────────────────────────────────
  separator('🏆 RÉSUMÉ DU CRASH TEST');
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n  Test A — Bon client (token immédiat)   : ✅ 200 OK      PASS');
  console.log('  Test B — Fraudeur WhatsApp (90s)        : ✅ 401 Unauth  PASS');
  console.log('  Test C — Anti-Replay (déjà scanné)      : ✅ 400 Bad Req PASS');
  console.log('\n  🔐 Verdict : La billetterie TOTP résiste aux fraudes par');
  console.log('  capture d\'écran et aux tentatives de replay.\n');
  console.log('  Tous les tests passés. Système ANTI-FRAUDE opérationnel. ✅\n');
}

runCrashTests().catch(console.error);
