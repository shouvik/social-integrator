#!/usr/bin/env node

/**
 * OAuth Connector SDK - Test All Providers
 * 
 * This script demonstrates what data each connector provides
 * Run after setting up OAuth credentials for each provider
 */

const { ConnectorSDK } = require('oauth-connector-sdk');
require('dotenv').config();

async function testConnectors() {
  console.log('🚀 Testing OAuth Connector SDK - All Providers\n');

  // Initialize SDK
  const sdk = await ConnectorSDK.init({
    tokenStore: {
      backend: 'memory',
      encryption: {
        key: process.env.ENCRYPTION_KEY,
        algorithm: 'aes-256-gcm'
      }
    },
    providers: {
      // Only configure providers with credentials
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
          redirectUri: `${process.env.BASE_URL}/callback/google`,
          usePKCE: true
        }
      }),
      ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          scopes: ['user', 'repo'],
          redirectUri: `${process.env.BASE_URL}/callback/github`,
          usePKCE: true
        }
      }),
      ...(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET && {
        reddit: {
          clientId: process.env.REDDIT_CLIENT_ID,
          clientSecret: process.env.REDDIT_CLIENT_SECRET,
          authorizationEndpoint: 'https://www.reddit.com/api/v1/authorize',
          tokenEndpoint: 'https://www.reddit.com/api/v1/access_token',
          scopes: ['identity', 'read', 'history'],
          redirectUri: `${process.env.BASE_URL}/callback/reddit`,
          usePKCE: true
        }
      }),
      ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET && {
        twitter: {
          clientId: process.env.TWITTER_CLIENT_ID,
          clientSecret: process.env.TWITTER_CLIENT_SECRET,
          authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
          tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
          scopes: ['tweet.read', 'users.read', 'offline.access'],
          redirectUri: `${process.env.BASE_URL}/callback/twitter`,
          usePKCE: true
        }
      })
    },
    rateLimits: {
      google: { qps: 10, concurrency: 5 },
      github: { qps: 10, concurrency: 5 },
      reddit: { qps: 1, concurrency: 2 },
      twitter: { qps: 5, concurrency: 3 },
      x: { qps: 5, concurrency: 3 },
      rss: { qps: 1, concurrency: 2 }
    },
    http: {
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatusCodes: [429, 500, 502, 503, 504]
      }
    },
    metrics: { enabled: true, port: 9091 },
    logging: { level: 'info' }
  });

  console.log('✅ SDK initialized successfully\n');

  // Test RSS (no OAuth needed)
  console.log('📡 Testing RSS Connector (No OAuth):');
  try {
    const rssData = await sdk.fetch('rss', 'test-user', {
      feedUrl: 'https://hnrss.org/frontpage',
      limit: 5
    });
    
    console.log(`   ✅ Fetched ${rssData.length} items from Hacker News`);
    console.log(`   📄 Example: "${rssData[0]?.title?.substring(0, 50)}..."`);
    console.log(`   🔗 URL: ${rssData[0]?.url}`);
  } catch (error) {
    console.log(`   ❌ RSS Error: ${error.message}`);
  }
  console.log();

  // Check available providers
  console.log('🔍 Available Providers:');
  const providers = ['google', 'github', 'reddit', 'twitter'];
  for (const provider of providers) {
    const hasCredentials = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    console.log(`   ${hasCredentials ? '✅' : '⏳'} ${provider.charAt(0).toUpperCase() + provider.slice(1)}: ${hasCredentials ? 'Configured' : 'Needs OAuth setup'}`);
  }

  console.log('\n🎯 Next Steps:');
  console.log('1. Set up OAuth apps for providers you want to use');
  console.log('2. Add credentials to .env file'); 
  console.log('3. Restart server to see all providers');
  console.log('4. Test OAuth flows at http://localhost:3001');
  
  console.log('\n📚 Documentation:');
  console.log('• Setup Guide: MULTI_PROVIDER_SETUP.md');
  console.log('• Data Capabilities: CONNECTOR_CAPABILITIES.md');
  console.log('• Setup Checklist: PROVIDER_SETUP_CHECKLIST.md');
}

// Run the test
testConnectors().catch(console.error);
