// tests/unit/TokenEncryption.test.ts

import { describe, it, expect } from 'vitest';
import { TokenEncryption } from '../../src/core/token/TokenEncryption';
import * as crypto from 'crypto';

describe('TokenEncryption', () => {
  const testKey = crypto.randomBytes(32).toString('hex');
  
  it('should throw error for invalid encryption key', () => {
    expect(() => new TokenEncryption('abc')).toThrow('32-byte hex string');
    expect(() => new TokenEncryption('')).toThrow('32-byte hex string');
    expect(() => new TokenEncryption('not-hex-at-all')).toThrow('32-byte hex string');
    expect(() => new TokenEncryption('a'.repeat(63))).toThrow('32-byte hex string'); // Too short
    expect(() => new TokenEncryption('a'.repeat(65))).toThrow('32-byte hex string'); // Too long
    
    // Valid key should work
    const validKey = 'a'.repeat(64);
    expect(() => new TokenEncryption(validKey)).not.toThrow();
  });

  it('should throw error for invalid previous keys', () => {
    const validCurrent = 'a'.repeat(64);
    const invalidPrevious = ['abc', 'def'];
    
    expect(() => new TokenEncryption(validCurrent, invalidPrevious))
      .toThrow('32-byte hex string');
    
    // Valid previous keys should work
    const validPrevious = ['b'.repeat(64), 'c'.repeat(64)];
    expect(() => new TokenEncryption(validCurrent, validPrevious)).not.toThrow();
  });
  
  it('should encrypt and decrypt data correctly', () => {
    const encryption = new TokenEncryption(testKey);
    const plaintext = 'sensitive token data';
    
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);
    
    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':');  // Format: iv:authTag:ciphertext
  });
  
  it('should produce different ciphertexts for same plaintext (IV randomization)', () => {
    const encryption = new TokenEncryption(testKey);
    const plaintext = 'same data';
    
    const encrypted1 = encryption.encrypt(plaintext);
    const encrypted2 = encryption.encrypt(plaintext);
    
    expect(encrypted1).not.toBe(encrypted2);  // Different IVs
    expect(encryption.decrypt(encrypted1)).toBe(plaintext);
    expect(encryption.decrypt(encrypted2)).toBe(plaintext);
  });
  
  it('should fail to decrypt with wrong key', () => {
    const encryption1 = new TokenEncryption(testKey);
    const encryption2 = new TokenEncryption(crypto.randomBytes(32).toString('hex'));
    
    const encrypted = encryption1.encrypt('data');
    
    expect(() => {
      encryption2.decrypt(encrypted);
    }).toThrow(/Failed to decrypt/);
  });
  
  it('should support key rotation (decrypt with old key)', () => {
    const oldKey = crypto.randomBytes(32).toString('hex');
    const newKey = crypto.randomBytes(32).toString('hex');
    
    // Encrypt with old key
    const oldEncryption = new TokenEncryption(oldKey);
    const encrypted = oldEncryption.encrypt('legacy data');
    
    // Decrypt with new key (should fallback to previous keys)
    const rotatedEncryption = new TokenEncryption(newKey, [oldKey]);
    const decrypted = rotatedEncryption.decrypt(encrypted);
    
    expect(decrypted).toBe('legacy data');
  });
  
  it('should encrypt with current key only', () => {
    const currentKey = crypto.randomBytes(32).toString('hex');
    const oldKey = crypto.randomBytes(32).toString('hex');
    
    const encryption = new TokenEncryption(currentKey, [oldKey]);
    const encrypted = encryption.encrypt('new data');
    
    // Should decrypt with current key
    const currentEncryption = new TokenEncryption(currentKey);
    const decrypted = currentEncryption.decrypt(encrypted);
    expect(decrypted).toBe('new data');
    
    // Should NOT decrypt with old key only
    const oldEncryption = new TokenEncryption(oldKey);
    expect(() => {
      oldEncryption.decrypt(encrypted);
    }).toThrow();
  });
  
  it('should handle malformed encrypted data', () => {
    const encryption = new TokenEncryption(testKey);
    
    const malformed = [
      'not-encrypted',
      'a:b',  // Too few parts
      'iv:authTag:invalidCiphertext'
    ];
    
    malformed.forEach(bad => {
      expect(() => {
        encryption.decrypt(bad);
      }).toThrow();
    });
  });
  
  it('should preserve data integrity with auth tag', () => {
    const encryption = new TokenEncryption(testKey);
    const encrypted = encryption.encrypt('important data');
    
    // Tamper with ciphertext
    const parts = encrypted.split(':');
    parts[2] = parts[2].substring(0, parts[2].length - 2) + 'FF';  // Modify last byte
    const tampered = parts.join(':');
    
    // Should fail authentication
    expect(() => {
      encryption.decrypt(tampered);
    }).toThrow();
  });
});

