#!/usr/bin/env tsx

/**
 * Print OAuth authorization URLs for all configured providers
 *
 * This script helps developers quickly get auth URLs for testing
 * without having to navigate through the web UI.
 *
 * Usage:
 *   tsx examples/express-app/scripts/print-auth-urls.ts
 *   npm run example:auth-urls
 */

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { ConnectorSDK } from '../../../src/index';
import type { ProviderName } from '../../../src/core/normalizer/types';

// Load environment variables from example app's .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const BANNER_WIDTH = 80;
const TEST_USER_ID = 'test-user-123';

/**
 * Print a formatted banner
 */
function printBanner(title: string) {
  const padding = Math.floor((BANNER_WIDTH - title.length - 2) / 2);
  const border = '='.repeat(BANNER_WIDTH);
  console.log('\n' + border);
  console.log(
    '=' + ' '.repeat(padding) + title + ' '.repeat(BANNER_WIDTH - padding - title.length - 2) + '='
  );
  console.log(border + '\n');
}

/**
 * Print a success message with checkmark
 */
function printSuccess(message: string) {
  console.log(`✅ ${message}`);
}

/**
 * Print a warning message
 */
function printWarning(message: string) {
  console.log(`⚠️  ${message}`);
}

/**
 * Print an error message
 */
function printError(message: string) {
  console.error(`❌ ${message}`);
}

/**
 * Print a section header
 */
function printSection(title: string) {
  console.log(`\n${'─'.repeat(BANNER_WIDTH)}`);
  console.log(`📍 ${title}`);
  console.log('─'.repeat(BANNER_WIDTH) + '\n');
}

/**
 * Check if provider credentials are configured
 */
function isProviderConfigured(provider: string): boolean {
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  return !!(clientId && clientSecret);
}

/**
 * Initialize SDK with available providers
 */
async function initSDK() {
  const encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

  if (!process.env.ENCRYPTION_KEY) {
    printWarning('ENCRYPTION_KEY not set, using temporary key (tokens will not persist)');
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const configuredProviders: Record<string, any> = {};

  // Check and configure each provider
  const providers = ['google', 'github', 'reddit', 'twitter'];

  for (const provider of providers) {
    if (isProviderConfigured(provider)) {
      const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
      const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];

      if (provider === 'google') {
        configuredProviders.google = {
          clientId,
          clientSecret,
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
          redirectUri: `${baseUrl}/callback/google`,
          usePKCE: true,
        };
      } else if (provider === 'github') {
        configuredProviders.github = {
          clientId,
          clientSecret,
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          scopes: ['user', 'repo'],
          redirectUri: `${baseUrl}/callback/github`,
          usePKCE: true,
        };
      } else if (provider === 'reddit') {
        configuredProviders.reddit = {
          clientId,
          clientSecret,
          authorizationEndpoint: 'https://www.reddit.com/api/v1/authorize',
          tokenEndpoint: 'https://www.reddit.com/api/v1/access_token',
          scopes: ['identity', 'read', 'history'],
          redirectUri: `${baseUrl}/callback/reddit`,
          usePKCE: true,
        };
      } else if (provider === 'twitter') {
        configuredProviders.twitter = {
          clientId,
          clientSecret,
          authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
          tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
          scopes: ['tweet.read', 'users.read', 'offline.access'],
          redirectUri: `${baseUrl}/callback/twitter`,
          usePKCE: true,
        };
      }
    }
  }

  if (Object.keys(configuredProviders).length === 0) {
    throw new Error(
      "No providers configured. Please set at least one provider's credentials in .env"
    );
  }

  const sdk = await ConnectorSDK.init({
    tokenStore: {
      backend: 'memory',
      encryption: {
        key: encryptionKey,
        algorithm: 'aes-256-gcm',
      },
    },
    providers: configuredProviders,
    rateLimits: {
      google: { qps: 10, concurrency: 5 },
      github: { qps: 10, concurrency: 5 },
      reddit: { qps: 1, concurrency: 2 },
      twitter: { qps: 5, concurrency: 3 },
      x: { qps: 5, concurrency: 3 },
      rss: { qps: 1, concurrency: 2 },
    },
    http: {
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatusCodes: [429, 500, 502, 503, 504],
      },
    },
    logging: {
      level: 'error', // Suppress logs for cleaner output
    },
  });

  return { sdk, configuredProviders: Object.keys(configuredProviders) };
}

/**
 * Print provider status and instructions
 */
function printProviderStatus() {
  printSection('Provider Configuration Status');

  const providers = [
    {
      name: 'Google',
      envPrefix: 'GOOGLE',
      docs: 'https://console.cloud.google.com/apis/credentials',
    },
    { name: 'GitHub', envPrefix: 'GITHUB', docs: 'https://github.com/settings/developers' },
    { name: 'Reddit', envPrefix: 'REDDIT', docs: 'https://www.reddit.com/prefs/apps' },
    {
      name: 'Twitter',
      envPrefix: 'TWITTER',
      docs: 'https://developer.twitter.com/en/portal/dashboard',
    },
  ];

  for (const provider of providers) {
    const configured = isProviderConfigured(provider.envPrefix.toLowerCase());
    if (configured) {
      printSuccess(`${provider.name} - Configured`);
    } else {
      printWarning(`${provider.name} - Not configured`);
      console.log(
        `   Set ${provider.envPrefix}_CLIENT_ID and ${provider.envPrefix}_CLIENT_SECRET in .env`
      );
      console.log(`   Get credentials: ${provider.docs}\n`);
    }
  }

  // RSS is always available
  printSuccess('RSS - Always available (no auth required)');
}

/**
 * Main function
 */
async function main() {
  try {
    printBanner('OAuth Connector SDK - Auth URLs');

    // Check .env file exists
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
      printWarning('.env file not found');
      console.log('   Copying .env.example to .env...\n');

      const examplePath = path.join(__dirname, '../.env.example');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, envPath);
        printSuccess('.env file created from .env.example');
        console.log('   Please edit .env and add your provider credentials\n');
      } else {
        printError('.env.example not found');
        process.exit(1);
      }
    }

    // Print provider status
    printProviderStatus();

    // Initialize SDK
    printSection('Initializing SDK');
    const { sdk, configuredProviders } = await initSDK();
    printSuccess(`SDK initialized with ${configuredProviders.length} provider(s)`);

    // Generate auth URLs
    printSection('OAuth Authorization URLs');
    console.log(`Test User ID: ${TEST_USER_ID}\n`);

    for (const provider of configuredProviders) {
      try {
        const authUrl = await sdk.connect(provider as ProviderName, TEST_USER_ID);
        console.log(`🔗 ${provider.toUpperCase()}`);
        console.log(`   ${authUrl}\n`);
      } catch (error: any) {
        printError(`Failed to generate ${provider} auth URL: ${error.message}`);
      }
    }

    // RSS instructions
    if (configuredProviders.length > 0) {
      printSection('RSS Feed (No Auth Required)');
      console.log('Test RSS fetch with:');
      console.log(`   curl "http://localhost:3001/data/rss?feed=https://hnrss.org/frontpage"\n`);
    }

    // Success footer
    printSection('Next Steps');
    console.log('1. Copy an auth URL above and paste it in your browser');
    console.log('2. Complete the OAuth flow (sign in and authorize)');
    console.log("3. You'll be redirected to http://localhost:3001/callback/{provider}");
    console.log('4. Make sure the example app server is running!\n');
    console.log('To start the example app:');
    console.log('   cd examples/express-app');
    console.log('   npm start\n');

    printBanner('Setup Complete!');
    process.exit(0);
  } catch (error: any) {
    printError(`Failed to generate auth URLs: ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main();
