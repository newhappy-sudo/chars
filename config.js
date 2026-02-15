// config.js - Configuration centralisée de l'application
// Compatible avec Node.js (backend) ET ES6 modules (frontend)
// Version PostgreSQL - Railway deployment

const config = {
  // ===================================
  // SOLANA CONFIGURATION
  // ===================================
  solana: {
    // RPC Endpoint - URL du réseau Solana
    rpcUrl: process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://solana-mainnet.core.chainstack.com/851c598be06920edfbce4b07891052bd',
    
    // RPC pour transactions (peut être premium pour meilleures performances)
    // Exemples: QuickNode, Alchemy, Helius, Triton
    transactionRpcUrl: process.env.SOLANA_TRANSACTION_RPC || process.env.SOLANA_RPC_URL || 'https://solana-mainnet.core.chainstack.com/851c598be06920edfbce4b07891052bd',
    
    // Network type
    network: process.env.SOLANA_NETWORK || 'mainnet-beta', // 'mainnet-beta', 'devnet', 'testnet'
    
    // Commitment level pour les requêtes
    commitment: 'confirmed', // 'processed', 'confirmed', 'finalized'
  },

  // ===================================
  // DATABASE CONFIGURATION (PostgreSQL)
  // ===================================
  database: {
    // Connection URL (automatique sur Railway)
    url: process.env.DATABASE_URL,
    
    // Pool configuration
    poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
    poolIdleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    poolConnectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    
    // SSL (requis pour Railway)
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  // ===================================
  // WALLET CONFIGURATION
  // ===================================
  wallet: {
    // Admin wallet address - Reçoit les fees de plateforme
    adminWallet: process.env.ADMIN_WALLET || 'Dw4fA9TdY68Kune3yWpkfCp8R7JY8FaQtMyKgyU3N4Q7',
    
    // Vanity address suffix pour les wallets de campagnes
    // IMPORTANT: Plus court = plus rapide
    // 'SO' (2 chars) = ~1-3 secondes (RECOMMANDÉ)
    // 'SOS' (3 chars) = ~30-60 secondes (risque timeout)
    vanitySuffix: process.env.VANITY_SUFFIX || 'SO',
    
    // Activer/désactiver la génération de vanity addresses
    enableVanity: process.env.ENABLE_VANITY !== 'false',
    
    // Nombre maximum de tentatives pour générer une vanity address
    vanityMaxAttempts: parseInt(process.env.VANITY_MAX_ATTEMPTS || '50000'),
  },

  // ===================================
  // FEE CONFIGURATION
  // ===================================
  fees: {
    // Pourcentage de frais prélevé (auto-collecté par fee-collector)
    // 0.01 = 1%, 0.05 = 5%, etc.
    platformFeePercentage: parseFloat(process.env.FEE_PERCENTAGE || '0.01'),
    
    // Seuil minimum pour collecter les fees (en SOL)
    // Évite les micro-transactions
    minFeeThreshold: parseFloat(process.env.MIN_FEE_THRESHOLD || '0.001'),
    
    // Message affiché à l'utilisateur
    platformFeeLabel: '1% platform fee',
  },

  // ===================================
  // FEE COLLECTOR SERVICE
  // ===================================
  feeCollector: {
    // Intervalle de polling en millisecondes (30s par défaut)
    pollInterval: parseInt(process.env.POLL_INTERVAL || '30000'),
    
    // Nombre de wallets traités par batch
    batchSize: parseInt(process.env.BATCH_SIZE || '10'),
    
    // Seuil minimum pour transférer les fees (lamports)
    minThreshold: parseInt(process.env.MIN_FEE_THRESHOLD || '0.001') * 1000000000,
    
    // Activer/désactiver le fee collector
    enabled: process.env.FEE_COLLECTOR_ENABLED !== 'false',
  },

  // ===================================
  // BLOCKCHAIN SYNC
  // ===================================
  sync: {
    // Intervalle de synchronisation en millisecondes
    intervalMs: parseInt(process.env.SYNC_INTERVAL || '60000'), // 60s par défaut
    
    // Activer/désactiver la synchronisation automatique
    enabled: process.env.SYNC_ENABLED !== 'false',
    
    // Nombre de transactions à récupérer par wallet
    transactionLimit: parseInt(process.env.SYNC_TX_LIMIT || '20'),
  },

  // ===================================
  // CAMPAIGN SETTINGS
  // ===================================
  campaign: {
    // Approbation admin requise pour nouvelles campagnes
    requireApproval: process.env.REQUIRE_APPROVAL !== 'false',
    
    // Nombre maximum de donations récentes affichées
    maxRecentDonations: parseInt(process.env.MAX_RECENT_DONATIONS || '10'),
    
    // Limite de caractères pour les commentaires
    commentMaxLength: parseInt(process.env.COMMENT_MAX_LENGTH || '500'),
    
    // Goal minimum (SOL)
    minGoalAmount: parseFloat(process.env.MIN_GOAL_AMOUNT || '1'),
    
    // Goal maximum (SOL)
    maxGoalAmount: parseFloat(process.env.MAX_GOAL_AMOUNT || '10000'),
  },

  // ===================================
  // SECURITY & SIGNATURES
  // ===================================
  security: {
    // Fenêtre de temps pour valider les signatures (ms)
    signatureTimeWindow: parseInt(process.env.SIGNATURE_TIME_WINDOW || '300000'), // 5 minutes
    
    // Actions nécessitant une signature
    requireSignatureFor: {
      delete: true,
      redeem: true,
      updateSocials: true,
      approve: false, // Admin uniquement, pas de signature requise
    },
  },

  // ===================================
  // RATE LIMITING
  // ===================================
  rateLimit: {
    // Limite de requêtes par IP
    maxRequestsPerIp: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    
    // Fenêtre de temps (ms)
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
    
    // Activer/désactiver rate limiting
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },

  // ===================================
  // MESSAGES & LABELS
  // ===================================
  messages: {
    // Messages de succès
    success: {
      donationSent: 'Transaction sent successfully!',
      campaignCreated: 'Campaign submitted for approval! An admin will review it shortly.',
      fundsRedeemed: 'Success! Funds transferred to your wallet',
      socialsUpdated: 'Social links updated successfully!',
      commentPosted: 'Comment posted successfully!',
      campaignApproved: 'Campaign approved successfully!',
      campaignDeleted: 'Campaign deleted successfully!',
    },
    
    // Messages d'erreur
    error: {
      connectWallet: 'Please connect your wallet',
      invalidAmount: 'Enter a valid amount',
      transactionFailed: 'Transaction failed. Please try again.',
      unauthorized: 'Unauthorized: Only campaign creator or admin can perform this action',
      noFunds: 'No funds available to redeem',
      alreadyRedeemed: 'Funds already redeemed',
      commentTooLong: 'Comment too long (max 500 characters)',
      campaignNotFound: 'Campaign not found',
      walletNotFound: 'Campaign wallet not found',
      databaseError: 'Database error. Please try again.',
      invalidSignature: 'Invalid signature',
      signatureExpired: 'Signature expired. Please try again.',
    },
    
    // Labels d'interface
    labels: {
      createCampaign: 'Create Campaign',
      makeDonation: 'Make a Donation',
      redeemFunds: 'Redeem Funds',
      updateSocials: 'Update Social Links',
      adminPanel: 'Admin Panel',
      recentDonators: 'Recent Donators',
      comments: 'Comments',
      postComment: 'Post Comment',
    },
    
    // Placeholders
    placeholders: {
      commentLoggedIn: 'Share your thoughts...',
      commentLoggedOut: 'Connect your wallet to comment',
      campaignName: 'Your name or organization',
      campaignDescription: 'Describe your project...',
      donationMessage: 'Leave a message of support...',
    },
  },

  // ===================================
  // UI CONFIGURATION
  // ===================================
  ui: {
    // Activer le dark mode par défaut
    defaultDarkMode: true,
    
    // Montants rapides pour les donations (en SOL)
    quickDonationAmounts: [0.1, 0.5, 1, 2, 5],
    
    // Délai avant fermeture automatique des modals (ms)
    modalAutoCloseDelay: 3000,
    
    // Items par page (pagination)
    itemsPerPage: 12,
  },

  // ===================================
  // ENVIRONMENT INFO
  // ===================================
  env: {
    // Environnement actuel
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Port du serveur
    port: parseInt(process.env.PORT || '3000'),
    
    // Hostname
    hostname: process.env.HOSTNAME || '0.0.0.0',
    
    // URL de base (pour Railway)
    baseUrl: process.env.BASE_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:3000',
  },

  // ===================================
  // LOGGING
  // ===================================
  logging: {
    // Niveau de log ('debug', 'info', 'warn', 'error')
    level: process.env.LOG_LEVEL || 'info',
    
    // Activer logs détaillés
    verbose: process.env.VERBOSE_LOGS === 'true',
    
    // Logs à activer
    enableLogs: {
      api: true,
      database: true,
      feeCollector: true,
      blockchain: true,
    },
  },

  // ===================================
  // FEATURE FLAGS
  // ===================================
  features: {
    // Activer création de campaigns
    enableCampaignCreation: process.env.ENABLE_CAMPAIGN_CREATION !== 'false',
    
    // Activer donations
    enableDonations: process.env.ENABLE_DONATIONS !== 'false',
    
    // Activer commentaires
    enableComments: process.env.ENABLE_COMMENTS !== 'false',
    
    // Activer redeem
    enableRedeem: process.env.ENABLE_REDEEM !== 'false',
    
    // Activer admin panel
    enableAdminPanel: process.env.ENABLE_ADMIN_PANEL !== 'false',
    
    // Activer blockchain sync
    enableBlockchainSync: process.env.ENABLE_BLOCKCHAIN_SYNC !== 'false',
  },

  // ===================================
  // DEPRECATED (conservés pour compatibilité)
  // ===================================
  paths: {
    // Ces paths ne sont plus utilisés avec PostgreSQL
    // Conservés pour rétrocompatibilité
    campaignsFile: 'data/campaigns.json',
    walletsFile: 'data/campaign-wallets.json',
    commentsFile: 'data/comments.json',
  },
};

// Helper function pour obtenir une valeur de config
config.get = function(path) {
  const keys = path.split('.');
  let value = config;
  
  for (const key of keys) {
    value = value[key];
    if (value === undefined) return null;
  }
  
  return value;
};

// Helper pour vérifier si en production
config.isProduction = function() {
  return config.env.nodeEnv === 'production';
};

// Helper pour vérifier si en développement
config.isDevelopment = function() {
  return config.env.nodeEnv === 'development';
};

// Export pour Node.js (backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
}

// Export par défaut pour ES6 modules (frontend)
export default config;