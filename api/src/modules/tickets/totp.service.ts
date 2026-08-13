import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);

  /**
   * Fenêtre de tolérance : 1 = ±1 step (±30s) pour gérer le décalage réseau.
   */
  private readonly WINDOW = 1;

  /**
   * Step TOTP = 30 secondes (standard RFC 6238).
   */
  private readonly STEP = 30;

  /**
   * Génère un secret TOTP unique Base32 de 20 bytes.
   */
  generateSecret(): string {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = crypto.randomBytes(20);
    let secret = '';
    for (const byte of bytes) {
      secret += base32Chars[byte % 32];
    }
    return secret;
  }

  /**
   * Génère le token TOTP courant pour un secret donné (pour tests).
   */
  generateToken(secret: string, fakeEpoch?: number): string {
    const epoch = fakeEpoch || Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / this.STEP);
    return this.computeTotp(secret, counter);
  }

  /**
   * Vérifie qu'un token correspond au secret avec la fenêtre de tolérance.
   */
  verifyToken(token: string, secret: string): boolean {
    const epoch = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(epoch / this.STEP);
    
    // Vérifie le token dans la fenêtre temporelle autorisée (ex: [-1, 0, +1])
    for (let i = -this.WINDOW; i <= this.WINDOW; i++) {
      if (this.computeTotp(secret, currentCounter + i) === token) {
        this.logger.debug(`TOTP Verify | Token valide avec offset de ${i} step(s)`);
        return true;
      }
    }
    return false;
  }

  /**
   * Implémentation TOTP standard (RFC 6238) avec HMAC-SHA1
   */
  private computeTotp(base32Secret: string, counter: number): string {
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
}
