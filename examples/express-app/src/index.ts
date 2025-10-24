import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { ConnectorSDK } from 'oauth-connector-sdk';
import type { ProviderName } from 'oauth-connector-sdk';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory session store (use Redis/persistent store in production)
// WARNING: This will lose all sessions on restart!
if (process.env.NODE_ENV === 'production') {
  console.error(
    '⚠️  ERROR: In-memory session store is not suitable for production!\n' +
    '   Sessions will be lost on restart and cannot be shared across instances.\n' +
    '   Please configure a persistent session store (Redis, PostgreSQL, etc.).\n' +
    '   Set NODE_ENV=development to suppress this error during local testing.'
  );
  process.exit(1);
}
const sessions: Map<string, { userId: string; provider?: ProviderName }> = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));

// Initialize SDK
let sdk: ConnectorSDK;

async function initSDK() {
  // Validate required environment variables
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  sdk = await ConnectorSDK.init({
    tokenStore: {
      backend: process.env.REDIS_URL ? 'redis' : 'memory',
      url: process.env.REDIS_URL,
      encryption: {
        key: encryptionKey,
        algorithm: 'aes-256-gcm'
      }
    },
    providers: {
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
          redirectUri: `${process.env.BASE_URL || 'http://localhost:3001'}/callback/google`,
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
          redirectUri: `${process.env.BASE_URL || 'http://localhost:3001'}/callback/github`,
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
          redirectUri: `${process.env.BASE_URL || 'http://localhost:3001'}/callback/reddit`,
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
          redirectUri: `${process.env.BASE_URL || 'http://localhost:3001'}/callback/twitter`,
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
    metrics: {
      enabled: true,
      port: 9090
    },
    logging: {
      level: 'debug'
    }
  });
  
  console.log('✅ OAuth Connector SDK initialized');
}

// Routes

// Home page
app.get('/', (req, res) => {
  const sessionId = req.query.session as string || 'demo-user';
  const session = sessions.get(sessionId) || { userId: sessionId };
  sessions.set(sessionId, session);
  
  const availableProviders = [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? ['google'] : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? ['github'] : []),
    ...(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? ['reddit'] : []),
    ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET ? ['twitter'] : []),
    'rss'
  ];
  
  res.render('index', { 
    session,
    providers: availableProviders
  });
});

// OAuth connect
app.get('/connect/:provider', async (req, res) => {
  try {
    const provider = req.params.provider as ProviderName;
    const sessionId = req.query.session as string || 'demo-user';
    const session = sessions.get(sessionId) || { userId: sessionId };
    
    if (provider === 'rss') {
      // RSS doesn't need OAuth
      session.provider = 'rss';
      sessions.set(sessionId, session);
      return res.redirect(`/?session=${sessionId}`);
    }
    
    const authUrl = await sdk.connect(provider, session.userId);
    
    // Store provider in session
    session.provider = provider;
    sessions.set(sessionId, session);
    
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback
app.get('/callback/:provider', async (req, res) => {
  try {
    const provider = req.params.provider as ProviderName;
    // For demo purposes, use the demo-user session (in production, use proper session management)
    const sessionId = 'demo-user';
    let session = sessions.get(sessionId);
    
    // Create session if it doesn't exist
    if (!session) {
      session = { userId: sessionId, provider };
      sessions.set(sessionId, session);
    }
    
    const params = new URLSearchParams(req.query as any);
    await sdk.handleCallback(provider, session.userId, params);
    
    // Update session with connected provider
    session.provider = provider;
    sessions.set(sessionId, session);
    
    res.redirect(`/data/${provider}?session=${sessionId}`);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'OAuth callback failed. Check server logs for details.'
    });
  }
});

// Fetch data
app.get('/data/:provider', async (req, res) => {
  try {
    const provider = req.params.provider as ProviderName;
    const sessionId = req.query.session as string || 'demo-user';
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(400).json({ error: 'Invalid session' });
    }
    
    let data;
    
    switch (provider) {
      case 'github':
        data = await sdk.fetch('github', session.userId, { type: 'starred', limit: 10 });
        break;
      case 'google':
        data = await sdk.fetch('google', session.userId, { service: 'gmail', limit: 10 });
        break;
      case 'reddit':
        data = await sdk.fetch('reddit', session.userId, { type: 'saved', limit: 10 });
        break;
      case 'twitter':
        data = await sdk.fetch('twitter', session.userId, { type: 'timeline', maxResults: 10 });
        break;
      case 'rss':
        const feedUrl = req.query.feed as string || 'https://hnrss.org/frontpage';
        data = await sdk.fetch('rss', session.userId, { feedUrl, limit: 10 });
        break;
      default:
        return res.status(400).json({ error: 'Unknown provider' });
    }
    
    res.render('data', { 
      provider,
      data,
      session
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Disconnect
app.post('/disconnect/:provider', async (req, res) => {
  try {
    const provider = req.params.provider as ProviderName;
    const sessionId = req.query.session as string || 'demo-user';
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(400).json({ error: 'Invalid session' });
    }
    
    await sdk.disconnect(provider, session.userId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    // This would be served by Prometheus scraper in production
    res.type('text/plain');
    res.send('# Metrics endpoint - configure Prometheus scraper at port 9090');
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start server
async function start() {
  try {
    await initSDK();
    
    app.listen(PORT, () => {
      console.log(`🚀 Example app listening on http://localhost:${PORT}`);
      console.log(`📊 Metrics available at http://localhost:9090/metrics`);
      console.log(`\n Available providers:`);
      console.log(`  - GitHub:  http://localhost:${PORT}/connect/github`);
      console.log(`  - Google:  http://localhost:${PORT}/connect/google`);
      console.log(`  - Reddit:  http://localhost:${PORT}/connect/reddit`);
      console.log(`  - Twitter: http://localhost:${PORT}/connect/twitter`);
      console.log(`  - RSS:     http://localhost:${PORT}/data/rss?feed=https://hnrss.org/frontpage`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

