# OAuth Connector SDK - Express.js Example

This example demonstrates how to use the OAuth Connector SDK in a real Express.js application with all 5 supported providers.

## Features

- ✅ OAuth2/OIDC flows for GitHub, Google, Reddit, Twitter
- ✅ RSS feed parsing (no OAuth required)
- ✅ Session management
- ✅ Beautiful UI with real-time data display
- ✅ Error handling and retry logic
- ✅ Metrics collection

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure OAuth Applications

Create OAuth apps for each provider:

**GitHub:** https://github.com/settings/developers
- Callback URL: `http://localhost:3000/callback/github`
- Scopes: `user`, `repo`

**Google:** https://console.cloud.google.com/apis/credentials
- Callback URL: `http://localhost:3000/callback/google`
- Scopes: Gmail API (read-only)

**Reddit:** https://www.reddit.com/prefs/apps
- Callback URL: `http://localhost:3000/callback/reddit`
- Scopes: `identity`, `read`, `history`

**Twitter:** https://developer.twitter.com/en/portal/dashboard
- Callback URL: `http://localhost:3000/callback/twitter`
- Scopes: `tweet.read`, `users.read`, `offline.access`

### 3. Set Environment Variables

```bash
cp .env.example .env
# Edit .env with your OAuth credentials
```

### 4. Start the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

### 5. Open in Browser

Visit http://localhost:3000 and start connecting providers!

## Usage

### Connect to a Provider

1. Click on a provider card (e.g., "GitHub")
2. Authorize the application on the provider's OAuth page
3. You'll be redirected back with your data

### View RSS Feeds

Click "View RSS Feed" to fetch and display items from Hacker News RSS feed.  
You can customize the feed URL in the browser address bar.

### Disconnect

Click "Disconnect" on the data page to revoke tokens and clear the connection.

## Project Structure

```
examples/express-app/
├── src/
│   └── index.ts          # Main Express server
├── views/
│   ├── index.ejs         # Home page
│   └── data.ejs          # Data display page
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## API Endpoints

- `GET /` - Home page with provider cards
- `GET /connect/:provider` - Initiate OAuth flow
- `GET /callback/:provider` - OAuth callback handler
- `GET /data/:provider` - Fetch and display provider data
- `POST /disconnect/:provider` - Disconnect from provider
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

## Production Considerations

1. **Use Redis for token storage** (set `REDIS_URL`)
2. **Set a strong encryption key** (32+ characters)
3. **Configure proper redirect URIs** for your domain
4. **Enable HTTPS** in production
5. **Set up monitoring** with Prometheus
6. **Configure rate limiting** per your needs
7. **Use environment-specific configs**

## Troubleshooting

### OAuth errors

- Check that redirect URIs match exactly
- Verify client ID and secrets
- Ensure scopes are correct

### Connection errors

- Check Redis connection if using `REDIS_URL`
- Verify network connectivity to provider APIs
- Check rate limits

### Data not fetching

- Ensure tokens are valid and not expired
- Check provider API status
- Verify scopes include required permissions

## Learn More

- [OAuth Connector SDK Documentation](../../README.md)
- [API Reference](../../docs/)
- [Provider Configuration](../../docs/configuration.md)

## License

Same as parent project (see root LICENSE file)

