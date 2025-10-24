// src/core/http/RetryHandler.ts

import type { RetryConfig } from './types';
import type { Logger } from '../../observability/Logger';

export class RetryHandler {
  constructor(
    private config: RetryConfig,
    private logger: Logger
  ) {}
  
  async execute<T>(task: () => Promise<T>, provider: string): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await task();
      } catch (error: any) {
        lastError = error;
        
        const status = error.response?.status;
        const isRetryable = this.config.retryableStatusCodes.includes(status);
        
        if (!isRetryable || attempt === this.config.maxRetries) {
          throw error;
        }
        
        const delay = Math.min(
          this.config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          this.config.maxDelay
        );
        
        this.logger.warn('Retrying request', { 
          provider, 
          attempt: attempt + 1, 
          delay, 
          status 
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

