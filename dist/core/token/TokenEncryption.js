"use strict";
// src/core/token/TokenEncryption.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenEncryption = void 0;
const crypto = __importStar(require("crypto"));
class TokenEncryption {
    currentKey;
    previousKeys;
    constructor(configOrKey, previousKeys = []) {
        let currentKey;
        let actualPreviousKeys;
        // Handle both config object and string key for backward compatibility
        if (typeof configOrKey === 'object') {
            currentKey = configOrKey.key;
            actualPreviousKeys = configOrKey.previousKeys || [];
            // Note: algorithm is currently ignored but preserved for interface compatibility
        }
        else {
            currentKey = configOrKey;
            actualPreviousKeys = previousKeys;
        }
        // Validate current key
        if (!currentKey || currentKey.length !== 64 || !/^[0-9a-f]{64}$/i.test(currentKey)) {
            throw new Error('Encryption key must be a 32-byte hex string (64 hexadecimal characters)');
        }
        this.currentKey = Buffer.from(currentKey, 'hex');
        // Validate previous keys
        this.previousKeys = actualPreviousKeys.map((k) => {
            if (!k || k.length !== 64 || !/^[0-9a-f]{64}$/i.test(k)) {
                throw new Error('All previous encryption keys must be 32-byte hex strings (64 hexadecimal characters)');
            }
            return Buffer.from(k, 'hex');
        });
    }
    encrypt(plaintext) {
        const jsonString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
        return this.encryptWithKey(jsonString, this.currentKey);
    }
    decrypt(encrypted) {
        // Try current key first
        try {
            return this.decryptWithKey(encrypted, this.currentKey);
        }
        catch (error) {
            // Fallback to previous keys
            for (const oldKey of this.previousKeys) {
                try {
                    return this.decryptWithKey(encrypted, oldKey);
                }
                catch {
                    continue;
                }
            }
            throw new Error('Failed to decrypt token with any available key');
        }
    }
    encryptWithKey(plaintext, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        // Format: iv:authTag:ciphertext
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }
    decryptWithKey(encrypted, key) {
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
exports.TokenEncryption = TokenEncryption;
//# sourceMappingURL=TokenEncryption.js.map