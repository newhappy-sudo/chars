-- schema.sql
-- Database schema for Railway PostgreSQL

-- Campaign wallets table
CREATE TABLE IF NOT EXISTS campaign_wallets (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(255) UNIQUE NOT NULL,
  campaign_wallet VARCHAR(255) NOT NULL,
  secret_key TEXT NOT NULL,
  creator_wallet VARCHAR(255) NOT NULL,
  
  -- Fee tracking
  last_balance BIGINT DEFAULT 0,
  total_received BIGINT DEFAULT 0,
  fees_collected BIGINT DEFAULT 0,
  last_checked TIMESTAMP DEFAULT NOW(),
  
  -- Redemption
  redeemed BOOLEAN DEFAULT false,
  total_redeemed BIGINT DEFAULT 0,
  redeemed_at TIMESTAMP,
  transaction_signature VARCHAR(255),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_wallets_campaign_id ON campaign_wallets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_wallets_redeemed ON campaign_wallets(redeemed);
CREATE INDEX IF NOT EXISTS idx_campaign_wallets_creator ON campaign_wallets(creator_wallet);

-- Campaigns table (optional - can keep using JSON files for campaigns data)
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50),
  goal_amount DECIMAL,
  creator_wallet VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255),
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_campaign_id ON campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_creator ON campaigns(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_campaigns_approved ON campaigns(approved);

-- Comments (optional)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_campaign_id ON comments(campaign_id);