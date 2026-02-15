-- schema-complete.sql
-- Complete database schema for Railway deployment

-- ============================================
-- Campaign Wallets Table
-- ============================================
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

CREATE INDEX IF NOT EXISTS idx_campaign_wallets_campaign_id ON campaign_wallets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_wallets_redeemed ON campaign_wallets(redeemed);
CREATE INDEX IF NOT EXISTS idx_campaign_wallets_creator ON campaign_wallets(creator_wallet);

-- ============================================
-- Campaigns Table
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  goal_amount DECIMAL(20, 9),
  creator_wallet VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255),
  
  -- Social links
  twitter VARCHAR(255),
  telegram VARCHAR(255),
  website VARCHAR(255),
  
  -- Status
  approved BOOLEAN DEFAULT false,
  funds_redeemed BOOLEAN DEFAULT false,
  
  -- Images
  image_url TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_campaign_id ON campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_creator ON campaigns(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_campaigns_approved ON campaigns(approved);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);

-- ============================================
-- Donations Table
-- ============================================
CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(255) NOT NULL,
  donor_wallet VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  transaction_signature VARCHAR(255) UNIQUE,
  timestamp TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_donations_campaign_id ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations(donor_wallet);
CREATE INDEX IF NOT EXISTS idx_donations_timestamp ON donations(timestamp DESC);

-- ============================================
-- Comments Table
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_campaign_id ON comments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- ============================================
-- Helper Functions
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for campaigns
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for campaign_wallets
DROP TRIGGER IF EXISTS update_campaign_wallets_updated_at ON campaign_wallets;
CREATE TRIGGER update_campaign_wallets_updated_at
    BEFORE UPDATE ON campaign_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views for Easy Queries
-- ============================================

-- Active campaigns with wallet info
CREATE OR REPLACE VIEW active_campaigns AS
SELECT 
    c.*,
    cw.campaign_wallet,
    cw.last_balance,
    cw.total_received,
    cw.fees_collected,
    cw.redeemed,
    cw.redeemed_at,
    COUNT(d.id) as donation_count,
    COALESCE(SUM(d.amount), 0) as total_donations
FROM campaigns c
LEFT JOIN campaign_wallets cw ON c.campaign_id = cw.campaign_id
LEFT JOIN donations d ON c.campaign_id = d.campaign_id
WHERE c.approved = true
GROUP BY c.id, cw.campaign_wallet, cw.last_balance, cw.total_received, 
         cw.fees_collected, cw.redeemed, cw.redeemed_at;

-- Campaign stats
CREATE OR REPLACE VIEW campaign_stats AS
SELECT 
    campaign_id,
    COUNT(*) as total_donations,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    MIN(amount) as min_amount,
    MAX(amount) as max_amount,
    COUNT(DISTINCT donor_wallet) as unique_donors
FROM donations
GROUP BY campaign_id;