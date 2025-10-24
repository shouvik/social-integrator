-- OAuth Connector SDK Database Schema
-- Based on LLD Section 9

-- Token storage table
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  encrypted_token_set TEXT NOT NULL,  -- AES-256-GCM encrypted JSON
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  
  UNIQUE(user_id, provider)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_provider ON oauth_tokens (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_expires_at ON oauth_tokens (expires_at);

-- Audit log table (optional)
CREATE TABLE IF NOT EXISTS oauth_audit_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'connected', 'refreshed', 'disconnected'
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for audit log (PostgreSQL syntax)
CREATE INDEX IF NOT EXISTS idx_user_audit ON oauth_audit_log (user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_provider_audit ON oauth_audit_log (provider, timestamp);

