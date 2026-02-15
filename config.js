// config.js - Configuration centralisée de l'application
// Compatible avec Node.js (backend) ET ES6 modules (frontend)

const config = {
  // ===================================
  // SOLANA CONFIGURATION
  // ===================================
  solana: {
    // RPC Endpoint - URL du réseau Solana pour les requêtes générales
    rpcUrl: 'https://solana-mainnet.core.chainstack.com/851c598be06920edfbce4b07891052bd',
    
    // RPC Endpoint pour les transactions (peut être différent pour de meilleures performances)
    // Utilise un endpoint premium/privé pour des transactions plus rapides
    // Exemples: QuickNode, Alchemy, Helius, Triton, etc.
    transactionRpcUrl: 'https://solana-mainnet.core.chainstack.com/851c598be06920edfbce4b07891052bd',  // REMPLACER PAR VOTRE ENDPOINT
    
    // Alternative RPC endpoints (décommenter pour utiliser):
    // rpcUrl: 'https://api.mainnet.solana.com',
    // rpcUrl: 'https://api.devnet.solana.com', // Pour tests
    
    // Network type
    network: 'mainnet-beta', // 'mainnet-beta', 'devnet', 'testnet'
  },

  // ===================================
  // WALLET CONFIGURATION
  // ===================================
  wallet: {
    // Admin wallet address - Reçoit les fees de plateforme
    adminWallet: 'Dw4fA9TdY68Kune3yWpkfCp8R7JY8FaQtMyKgyU3N4Q7',
    
    // Vanity address suffix pour les wallets de campagnes
    // Exemple: 'SOS' génère des addresses finissant par ...SOS
    vanitySuffix: 'AK',
    
    // Activer/désactiver la génération de vanity addresses
    // Si false, génère des addresses normales (plus rapide)
    enableVanity: false,
    
    // Nombre maximum de tentatives pour générer une vanity address
    // Plus le suffix est long, plus il faut de tentatives
    // Augmenter si vous voulez garantir une vanity address
    vanityMaxAttempts: 50000,
  },

  // ===================================
  // FEE CONFIGURATION
  // ===================================
  fees: {
    // Pourcentage de frais prélevé lors du redeem
    // 0.01 = 1%, 0.05 = 5%, etc.
    platformFeePercentage: 0.01,
    
    // Message affiché à l'utilisateur
    platformFeeLabel: '1% platform fee',
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
    },
    
    // Messages d'erreur
    error: {
      connectWallet: 'Please connect your wallet',
      invalidAmount: 'Enter a valid amount',
      transactionFailed: 'Transaction failed. Please try again.',
      unauthorized: 'Unauthorized: You are not the creator of this campaign',
      noFunds: 'No funds available to redeem',
      alreadyRedeemed: 'Funds already redeemed',
      commentTooLong: 'Comment too long (max 500 characters)',
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
  // BLOCKCHAIN SYNC
  // ===================================
  sync: {
    // Intervalle de synchronisation en millisecondes
    // 30000 = 30 secondes
    intervalMs: 30000,
    
    // Activer/désactiver la synchronisation automatique
    enabled: false,
  },

  // ===================================
  // CAMPAIGN SETTINGS
  // ===================================
  campaign: {
    // Approbation admin requise pour nouvelles campagnes
    requireApproval: true,
    
    // Nombre maximum de donations récentes affichées
    maxRecentDonations: 10,
    
    // Limite de caractères pour les commentaires
    commentMaxLength: 500,
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
    modalAutoCloseDelay: 5000,
  },

  // ===================================
  // FILE PATHS (pour le backend)
  // ===================================
  paths: {
    campaignsFile: 'data/campaigns.json',
    walletsFile: 'data/campaign-wallets.json',
    commentsFile: 'data/comments.json',
  },
};

// Export pour Node.js (backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
}

// Export par défaut pour ES6 modules (frontend)
export default config;