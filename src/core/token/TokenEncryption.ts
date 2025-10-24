// src/core/token/TokenEncryption.ts

import * as crypto from 'crypto';

export class TokenEncryption {
  private currentKey: Buffer;
  private previousKeys: Buffer[];
  
  constructor(currentKey: string, previousKeys: string[] = []) {
    // Validate current key
    if (!currentKey || currentKey.length !== 64 || !/^[0-9a-f]{64}$/i.test(currentKey)) {
      throw new Error('Encryption key must be a 32-byte hex string (64 hexadecimal characters)');
    }
    
    this.currentKey = Buffer.from(currentKey, 'hex');
    
    // Validate previous keys
    this.previousKeys = previousKeys.map(k => {
      if (!k || k.length !== 64 || !/^[0-9a-f]{64}$/i.test(k)) {
        throw new Error('All previous encryption keys must be 32-byte hex strings (64 hexadecimal characters)');
      }
      return Buffer.from(k, 'hex');
    });
  }
  
  encrypt(plaintext: string): string {
    return this.encryptWithKey(plaintext, this.currentKey);
  }
  
  decrypt(encrypted: string): string {
    // Try current key first
    try {
      return this.decryptWithKey(encrypted, this.currentKey);
    } catch (error) {
      // Fallback to previous keys
      for (const oldKey of this.previousKeys) {
        try {
          return this.decryptWithKey(encrypted, oldKey);
        } catch {
          continue;
        }
      }
      throw new Error('Failed to decrypt token with any available key');
    }
  }
  
  private encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  private decryptWithKey(encrypted: string, key: Buffer): string {
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

