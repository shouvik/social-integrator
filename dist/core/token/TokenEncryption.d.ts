export interface TokenEncryptionConfig {
    key: string;
    algorithm: string;
    previousKeys?: string[];
}
export declare class TokenEncryption {
    private currentKey;
    private previousKeys;
    constructor(configOrKey: TokenEncryptionConfig | string, previousKeys?: string[]);
    encrypt(plaintext: string | object): string;
    decrypt(encrypted: string): string;
    private encryptWithKey;
    private decryptWithKey;
}
//# sourceMappingURL=TokenEncryption.d.ts.map