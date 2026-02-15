// server.js
// Custom Next.js server with integrated fee-collector for Railway
// Uses PostgreSQL instead of JSON files

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import pg from 'pg';

const { Pool } = pg;

// Fee collector imports
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Railway needs 0.0.0.0 instead of localhost
const port = parseInt(process.env.PORT || '3000', 10);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Fee collector configuration
const ADMIN_WALLET = new PublicKey(process.env.ADMIN_WALLET);
const FEE_PERCENTAGE = parseFloat(process.env.FEE_PERCENTAGE || '0.01');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30000');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const MIN_FEE_THRESHOLD = parseFloat(process.env.MIN_FEE_THRESHOLD || '0.001') * LAMPORTS_PER_SOL;

const connection = new Connection(RPC_URL, 'confirmed');

// Fee Collector Class
class FeeCollector {
  constructor() {
    this.polling = false;
    this.pollTimer = null;
  }

  async startPolling() {
    if (this.polling) return;
    this.polling = true;
    console.log('[FEE-COLLECTOR] 🚀 Starting fee collection...');
    await this.poll();
  }

  async poll() {
    if (!this.polling) return;

    try {
      const result = await pool.query(
        'SELECT * FROM campaign_wallets WHERE redeemed = false'
      );
      const wallets = result.rows;
      
      if (wallets.length === 0) {
        console.log('[FEE-COLLECTOR] No active wallets');
      } else {
        console.log(`[FEE-COLLECTOR] 🔍 Checking ${wallets.length} active wallets...`);
        const batches = this.createBatches(wallets, BATCH_SIZE);
        
        for (const batch of batches) {
          await this.processBatch(batch);
        }
      }
    } catch (error) {
      console.error('[FEE-COLLECTOR] ❌ Error:', error);
    }

    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL);
    }
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  async processBatch(wallets) {
    try {
      const publicKeys = wallets.map(w => new PublicKey(w.campaign_wallet));
      const accounts = await connection.getMultipleAccountsInfo(publicKeys);
      
      for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const account = accounts[i];
        
        if (!account) continue;

        const currentBalance = account.lamports;
        const lastBalance = wallet.last_balance || 0;

        if (currentBalance > lastBalance) {
          const received = currentBalance - lastBalance;
          await this.handleNewFunds(wallet, received, currentBalance);
        }
      }
    } catch (error) {
      console.error('[FEE-COLLECTOR] ❌ Batch error:', error);
    }
  }

  async handleNewFunds(wallet, received, newBalance) {
    const receivedSOL = received / LAMPORTS_PER_SOL;
    const feeAmount = Math.floor(received * FEE_PERCENTAGE);
    const feeSOL = feeAmount / LAMPORTS_PER_SOL;

    console.log(`[FEE-COLLECTOR] 💰 Campaign ${wallet.campaign_id} received ${receivedSOL} SOL`);

    if (feeAmount < MIN_FEE_THRESHOLD) {
      console.log(`[FEE-COLLECTOR] ⏭️ Fee too small (${feeSOL} SOL), skipping`);
      await this.updateWalletBalance(wallet.campaign_id, newBalance, received, 0);
      return;
    }

    console.log(`[FEE-COLLECTOR] 💸 Collecting fee: ${feeSOL} SOL`);

    try {
      const signature = await this.transferFee(wallet, feeAmount);
      console.log(`[FEE-COLLECTOR] ✅ Fee collected! TX: ${signature.substring(0, 8)}...`);
      await this.updateWalletBalance(wallet.campaign_id, newBalance - feeAmount, received, feeAmount);
    } catch (error) {
      console.error(`[FEE-COLLECTOR] ❌ Transfer failed:`, error.message);
      await this.updateWalletBalance(wallet.campaign_id, newBalance, received, 0);
    }
  }

  async transferFee(wallet, feeAmount) {
    const secretKey = bs58.decode(wallet.secret_key);
    const campaignKeypair = Keypair.fromSecretKey(secretKey);

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: campaignKeypair.publicKey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: campaignKeypair.publicKey,
        toPubkey: ADMIN_WALLET,
        lamports: feeAmount,
      })
    );

    transaction.sign(campaignKeypair);
    return await connection.sendRawTransaction(transaction.serialize());
  }

  async updateWalletBalance(campaignId, newBalance, received, feeCollected) {
    await pool.query(
      `UPDATE campaign_wallets 
       SET last_balance = $1,
           total_received = COALESCE(total_received, 0) + $2,
           fees_collected = COALESCE(fees_collected, 0) + $3,
           last_checked = NOW()
       WHERE campaign_id = $4`,
      [newBalance, received, feeCollected, campaignId]
    );
  }

  stopPolling() {
    console.log('[FEE-COLLECTOR] 🛑 Stopping...');
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

// Start Next.js + Fee Collector
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('   🚀 Starting Next.js + Fee Collector (Railway)');
console.log('═══════════════════════════════════════════════════════');
console.log('');

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Start fee collector
  const collector = new FeeCollector();
  
  try {
    await collector.startPolling();
    console.log('[SERVER] ✅ Fee collector started');
    console.log('');
  } catch (error) {
    console.error('[SERVER] ⚠️ Fee collector failed:', error.message);
    console.log('[SERVER] Continuing without fee collection');
    console.log('');
  }

  // Create server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   ✅ Server Ready on Railway`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`   🌐 Port:             ${port}`);
    console.log(`   💰 Fee Collection:   Active`);
    console.log(`   📊 Database:         PostgreSQL`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('');
    console.log('[SERVER] 🛑 Shutting down...');
    collector.stopPolling();
    await pool.end();
    server.close(() => {
      console.log('[SERVER] ✅ Goodbye!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});