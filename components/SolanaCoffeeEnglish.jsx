import React, { useState, useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import config from '../config.js';

// ===================================
// 🔧 CONFIGURATION - FROM config.js
// ===================================

// SOLANA
const SOLANA_RPC = config.solana.rpcUrl;
const TRANSACTION_RPC = config.solana.transactionRpcUrl;
const NETWORK = config.solana.network;

// WALLET & FEES
const ADMIN_WALLET = config.wallet.adminWallet;
const PLATFORM_FEE_PERCENTAGE = config.fees.platformFeePercentage;
const VANITY_SUFFIX = config.wallet.vanitySuffix;
const ENABLE_VANITY = config.wallet.enableVanity;

// SYNC
const SYNC_INTERVAL = config.sync.intervalMs;

// UI
const QUICK_AMOUNTS = config.ui.quickDonationAmounts;
const MODAL_CLOSE_DELAY = config.ui.modalAutoCloseDelay;
const DEFAULT_DARK_MODE = config.ui.defaultDarkMode;

// MESSAGES
const MESSAGES = config.messages;

// ===================================
// END CONFIGURATION
// ===================================

// Import blockchain sync hook
// Place this file in hooks/useBlockchainSync.js
function useBlockchainSync(enabled = true) {
  const [syncStatus, setSyncStatus] = useState({
    lastSync: null,
    syncing: false,
    error: null,
    updated: 0
  });

  const syncBlockchain = React.useCallback(async () => {
    if (!enabled) return;
    
    setSyncStatus(prev => ({ ...prev, syncing: true, error: null }));
    
    try {
      const response = await fetch('/api/sync-blockchain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSyncStatus({
          lastSync: new Date(),
          syncing: false,
          error: null,
          updated: data.updated || 0
        });
        
        return data.updated > 0;
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Blockchain sync error:', error);
      setSyncStatus(prev => ({
        ...prev,
        syncing: false,
        error: error.message
      }));
      return false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    syncBlockchain();
    const interval = setInterval(() => {
      syncBlockchain();
    }, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [enabled, syncBlockchain]);

  return {
    syncStatus,
    syncNow: syncBlockchain
  };
}

// Helper function to load campaigns from API
const loadCampaigns = async () => {
  try {
    const response = await fetch('/api/get-campaigns');
    const data = await response.json();
    return data.campaigns || [];
  } catch (error) {
    console.error('Error loading campaigns:', error);
    return [];
  }
};

// Helper function to save campaigns to API
const saveCampaigns = async (campaigns) => {
  try {
    await fetch('/api/save-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns })
    });
  } catch (error) {
    console.error('Error saving campaigns:', error);
  }
};

// Admin Panel Component
function AdminPanel({ campaigns, onUpdateCampaigns, onClose, darkMode, publicKey, signMessage }) {
  const [editingCampaign, setEditingCampaign] = useState(null);

  const handleDelete = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign? This will also delete the associated wallet.')) return;
    
    if (!publicKey) {
      alert('Please connect your wallet');
      return;
    }

    if (!signMessage) {
      alert('Your wallet does not support message signing');
      return;
    }
    
    try {
      console.log('[ADMIN-DELETE] Requesting signature...');

      // Create message to sign
      const timestamp = Date.now();
      const message = `Delete Campaign\nCampaign ID: ${campaignId}\nTimestamp: ${timestamp}\nWallet: ${publicKey.toString()}`;
      
      // Request signature
      const messageBytes = new TextEncoder().encode(message);
      let signature;
      
      try {
        const signatureUint8 = await signMessage(messageBytes);
        const bs58 = await import('bs58');
        signature = bs58.default.encode(signatureUint8);
        console.log('[ADMIN-DELETE] ✅ Signature obtained');
      } catch (signError) {
        console.error('[ADMIN-DELETE] Signature rejected:', signError);
        alert('Signature rejected. Deletion cancelled.');
        return;
      }

      // Call API to delete campaign and wallet with signature
      const response = await fetch('/api/delete-campaign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          campaignId,
          walletAddress: publicKey.toString(),
          signature: signature,
          message: message,
          timestamp: timestamp
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[ADMIN-DELETE] ✅ Campaign ${campaignId} deleted by ${data.deletedBy}`);
        
        // Reload campaigns from server to ensure sync
        const freshCampaigns = await loadCampaigns();
        onUpdateCampaigns(freshCampaigns);
        
        console.log(`[ADMIN-DELETE] Campaigns reloaded from server: ${freshCampaigns.length} total`);
        alert('Campaign deleted successfully');
      } else {
        const error = await response.json();
        alert(`Error deleting campaign: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Error deleting campaign. Please try again.');
    }
  };

  const handleApprove = async (campaignId) => {
    const updated = campaigns.map(c => 
      c.id === campaignId ? { ...c, approved: true } : c
    );
    await saveCampaigns(updated);
    onUpdateCampaigns(updated);
  };

  const handleEdit = (campaign) => {
    setEditingCampaign(campaign);
  };

  const handleSaveEdit = async () => {
    const updated = campaigns.map(c => 
      c.id === editingCampaign.id ? editingCampaign : c
    );
    await saveCampaigns(updated);
    onUpdateCampaigns(updated);
    setEditingCampaign(null);
  };

  const pendingCampaigns = campaigns.filter(c => !c.approved);
  const approvedCampaigns = campaigns.filter(c => c.approved);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{
        ...styles.adminPanel,
        background: darkMode ? '#1e293b' : 'white',
        color: darkMode ? '#f1f5f9' : '#1A1A1A'
      }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{
          ...styles.closeBtn,
          background: darkMode ? '#334155' : '#F5F1ED',
          color: darkMode ? '#cbd5e1' : '#666'
        }} className="close-btn">✕</button>
        
        <h2 style={{
          ...styles.adminTitle,
          color: darkMode ? '#f1f5f9' : '#1A1A1A'
        }}>Admin Panel</h2>

        {editingCampaign ? (
          <div style={styles.editForm}>
            <h3 style={{ color: darkMode ? '#f1f5f9' : '#1A1A1A' }}>Edit Campaign</h3>
            <div style={styles.formGroup}>
              <label style={{
                ...styles.label,
                color: darkMode ? '#f1f5f9' : '#1A1A1A'
              }}>Name</label>
              <input
                type="text"
                value={editingCampaign.name}
                onChange={(e) => setEditingCampaign({...editingCampaign, name: e.target.value})}
                style={{
                  ...styles.input,
                  background: darkMode ? '#334155' : 'white',
                  color: darkMode ? '#f1f5f9' : '#1A1A1A',
                  borderColor: darkMode ? '#4b5563' : '#E0E0E0'
                }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={{
                ...styles.label,
                color: darkMode ? '#f1f5f9' : '#1A1A1A'
              }}>Description</label>
              <textarea
                value={editingCampaign.description}
                onChange={(e) => setEditingCampaign({...editingCampaign, description: e.target.value})}
                style={{
                  ...styles.textarea,
                  background: darkMode ? '#334155' : 'white',
                  color: darkMode ? '#f1f5f9' : '#1A1A1A',
                  borderColor: darkMode ? '#4b5563' : '#E0E0E0'
                }}
                rows="4"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={{
                ...styles.label,
                color: darkMode ? '#f1f5f9' : '#1A1A1A'
              }}>Goal Amount (SOL)</label>
              <input
                type="number"
                value={editingCampaign.goalAmount}
                onChange={(e) => setEditingCampaign({...editingCampaign, goalAmount: parseFloat(e.target.value)})}
                style={{
                  ...styles.input,
                  background: darkMode ? '#334155' : 'white',
                  color: darkMode ? '#f1f5f9' : '#1A1A1A',
                  borderColor: darkMode ? '#4b5563' : '#E0E0E0'
                }}
              />
            </div>
            <div style={styles.adminActions}>
              <button onClick={handleSaveEdit} style={styles.saveBtn}>Save Changes</button>
              <button onClick={() => setEditingCampaign(null)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.adminSection}>
              <h3 style={{
                ...styles.sectionSubtitle,
                color: darkMode ? '#cbd5e1' : '#374151'
              }}>Pending Approval ({pendingCampaigns.length})</h3>
              {pendingCampaigns.length === 0 ? (
                <p style={{
                  ...styles.emptyText,
                  color: darkMode ? '#64748b' : '#999'
                }}>No pending campaigns</p>
              ) : (
                <div style={styles.campaignsList}>
                  {pendingCampaigns.map(campaign => (
                    <div key={campaign.id} style={{
                      ...styles.adminCard,
                      background: darkMode ? '#0f172a' : '#F9FAFB',
                      borderColor: darkMode ? '#334155' : '#E5E7EB'
                    }}>
                      <div style={styles.adminCardHeader}>
                        <div>
                          <strong style={{ color: darkMode ? '#f1f5f9' : '#1A1A1A' }}>{campaign.name}</strong>
                          <span style={{
                            ...styles.adminCardType,
                            color: darkMode ? '#94a3b8' : '#6B7280'
                          }}> - {campaign.type}</span>
                        </div>
                      </div>
                      <p style={{
                        ...styles.adminCardDesc,
                        color: darkMode ? '#cbd5e1' : '#4B5563'
                      }}>{campaign.description}</p>
                      <div style={{
                        ...styles.adminCardInfo,
                        color: darkMode ? '#94a3b8' : '#6B7280'
                      }}>
                        <span>Goal: {campaign.goalAmount} SOL</span>
                        <span>Wallet: {campaign.walletAddress.slice(0, 8)}...</span>
                      </div>
                      <div style={styles.adminActions}>
                        <button onClick={() => handleApprove(campaign.id)} style={styles.approveBtn}>Approve</button>
                        <button onClick={() => handleEdit(campaign)} style={styles.editBtn}>Edit</button>
                        <button onClick={() => handleDelete(campaign.id)} style={styles.deleteBtn}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.adminSection}>
              <h3 style={{
                ...styles.sectionSubtitle,
                color: darkMode ? '#cbd5e1' : '#374151'
              }}>Active Campaigns ({approvedCampaigns.length})</h3>
              {approvedCampaigns.length === 0 ? (
                <p style={{
                  ...styles.emptyText,
                  color: darkMode ? '#64748b' : '#999'
                }}>No active campaigns</p>
              ) : (
                <div style={styles.campaignsList}>
                  {approvedCampaigns.map(campaign => (
                    <div key={campaign.id} style={{
                      ...styles.adminCard,
                      background: darkMode ? '#0f172a' : '#F9FAFB',
                      borderColor: darkMode ? '#334155' : '#E5E7EB'
                    }}>
                      <div style={styles.adminCardHeader}>
                        <div>
                          <strong style={{ color: darkMode ? '#f1f5f9' : '#1A1A1A' }}>{campaign.name}</strong>
                          <span style={{
                            ...styles.adminCardType,
                            color: darkMode ? '#94a3b8' : '#6B7280'
                          }}> - {campaign.type}</span>
                        </div>
                      </div>
                      <p style={{
                        ...styles.adminCardDesc,
                        color: darkMode ? '#cbd5e1' : '#4B5563'
                      }}>{campaign.description}</p>
                      <div style={{
                        ...styles.adminCardInfo,
                        color: darkMode ? '#94a3b8' : '#6B7280'
                      }}>
                        <span>Raised: {campaign.currentAmount} / {campaign.goalAmount} SOL</span>
                        <span>{campaign.supporters} supporters</span>
                      </div>
                      <div style={styles.adminActions}>
                        <button onClick={() => handleEdit(campaign)} style={styles.editBtn}>Edit</button>
                        <button onClick={() => handleDelete(campaign.id)} style={styles.deleteBtn}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Campaign Detail Component
function CampaignDetail({ campaign, onBack, onDonate, onRedeem, onDelete, darkMode, publicKey, signMessage }) {
  const isCreator = publicKey && campaign.creatorWallet && publicKey.toString() === campaign.creatorWallet;
  const [showEditSocials, setShowEditSocials] = useState(false);
  const [activeTab, setActiveTab] = useState('donations'); // 'donations' or 'comments'
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [loadingComment, setLoadingComment] = useState(false);
  const [socialsData, setSocialsData] = useState({
    twitter: campaign.twitter || '',
    telegram: campaign.telegram || '',
    website: campaign.website || ''
  });
  
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load comments
  useEffect(() => {
    const loadComments = async () => {
      try {
        const response = await fetch(`/api/get-comments?campaignId=${campaign.id}`);
        const data = await response.json();
        if (response.ok) {
          setComments(data.comments || []);
        }
      } catch (error) {
        console.error('Error loading comments:', error);
      }
    };
    loadComments();
  }, [campaign.id]);

  const handlePostComment = async () => {
    if (!publicKey) {
      alert('Please connect your wallet to post a comment');
      return;
    }

    if (!commentText.trim()) {
      alert('Please enter a comment');
      return;
    }

    try {
      setLoadingComment(true);
      const response = await fetch('/api/post-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.id,
          wallet: publicKey.toString(),
          text: commentText.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setComments([data.comment, ...comments]);
        setCommentText('');
      } else {
        alert('Error posting comment');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error posting comment');
    } finally {
      setLoadingComment(false);
    }
  };
  
  const handleSaveSocials = async () => {
    if (!publicKey) {
      alert('Please connect your wallet');
      return;
    }

    if (!signMessage) {
      alert('Your wallet does not support message signing');
      return;
    }

    try {
      console.log('[UPDATE-SOCIALS] Requesting signature...');
      
      // Request signature
      const timestamp = Date.now();
      const message = `Update Social Links\nCampaign ID: ${campaign.id}\nTimestamp: ${timestamp}\nWallet: ${publicKey.toString()}`;
      
      const messageBytes = new TextEncoder().encode(message);
      let signature;
      
      try {
        const signatureUint8 = await signMessage(messageBytes);
        const bs58 = await import('bs58');
        signature = bs58.default.encode(signatureUint8);
        console.log('[UPDATE-SOCIALS] ✅ Signature obtained');
      } catch (signError) {
        console.error('[UPDATE-SOCIALS] Signature rejected:', signError);
        alert('Signature rejected. Update cancelled.');
        return;
      }
      
      const response = await fetch('/api/update-campaign-socials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.id,
          socials: socialsData,
          walletAddress: publicKey.toString(),
          signature: signature,
          message: message,
          timestamp: timestamp
        })
      });

      if (response.ok) {
        // Update local campaign data
        campaign.twitter = socialsData.twitter;
        campaign.telegram = socialsData.telegram;
        campaign.website = socialsData.website;
        setShowEditSocials(false);
        alert('Social links updated successfully!');
      } else {
        const error = await response.json();
        alert(`Error updating social links: ${error.error}`);
      }
    } catch (error) {
      console.error('[UPDATE-SOCIALS] Error:', error);
      alert('Error updating social links');
    }
  };
  
  const formatTime = (timestamp) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const progress = Math.min((campaign.currentAmount / campaign.goalAmount) * 100, 100);

  return (
    <div style={styles.detailContainer}>
      <button onClick={onBack} style={styles.backButton} className="back-btn">
        ← Back to campaigns
      </button>

      <div style={styles.detailGrid} className="detail-grid">
        <div style={styles.detailImageSection} className="detail-image-section">
          <div 
            style={{
              ...styles.detailImage,
              backgroundImage: `url(${campaign.image})`
            }}
          />
        </div>

        <div style={styles.detailInfo}>
          <div style={styles.detailHeader}>
            <div style={styles.detailAvatar}>
              <img 
                src={campaign.image} 
                alt={campaign.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '0.5rem'
              }}>
                <h1 style={styles.detailName}>{campaign.name}</h1>
                
                {/* Social Icons */}
                {(campaign.twitter || campaign.telegram || campaign.website) && (
                  <div style={{ display: 'flex', gap: '0.75rem', marginLeft: '1rem' }}>
                    {campaign.twitter && (
                      <a 
                        href={campaign.twitter} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          color: darkMode ? '#94a3b8' : '#666',
                          fontSize: '1.5rem',
                          transition: 'color 0.2s'
                        }}
                        className="social-icon"
                      >
                        <i className="bi bi-twitter-x"></i>
                      </a>
                    )}
                    {campaign.telegram && (
                      <a 
                        href={campaign.telegram} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          color: darkMode ? '#94a3b8' : '#666',
                          fontSize: '1.5rem',
                          transition: 'color 0.2s'
                        }}
                        className="social-icon"
                      >
                        <i className="bi bi-telegram"></i>
                      </a>
                    )}
                    {campaign.website && (
                      <a 
                        href={campaign.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          color: darkMode ? '#94a3b8' : '#666',
                          fontSize: '1.5rem',
                          transition: 'color 0.2s'
                        }}
                        className="social-icon"
                      >
                        <i className="bi bi-globe"></i>
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  ...styles.detailType,
                  ...(campaign.type === 'charity' ? styles.detailTypeCharity : styles.detailTypePerson)
                }}>
                  {campaign.type === 'charity' ? (
                    <><i className="bi bi-balloon-heart"></i> Charity</>
                  ) : (
                    <><i className="bi bi-person-badge"></i> Person</>
                  )}
                </span>
                
                {/* Redeem Status Badge */}
                {campaign.fundsRedeemed !== undefined && (
                  <span style={{
                    ...styles.detailType,
                    ...(campaign.fundsRedeemed ? {
                      background: darkMode ? '#7f1d1d' : '#FEE2E2',
                      color: darkMode ? '#fca5a5' : '#991B1B'
                    } : {
                      background: darkMode ? '#065f46' : '#D1FAE5',
                      color: darkMode ? '#6ee7b7' : '#065F46'
                    })
                  }}>
                    {campaign.fundsRedeemed ? (
                      <><i className="bi bi-check-square"></i> Campaign funds redeemed</>
                    ) : (
                      <><i className="bi bi-x-square"></i> Campaign funds not redeemed</>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Update Socials Button - Before description */}
          {isCreator && (!campaign.twitter || !campaign.telegram || !campaign.website) && (
            <button 
              onClick={() => setShowEditSocials(true)} 
              style={{
                width: '100%',
                padding: '0.75rem',
                background: darkMode ? '#334155' : '#e5e7eb',
                color: darkMode ? '#cbd5e1' : '#1f2937',
                border: `2px solid ${darkMode ? '#4b5563' : '#d1d5db'}`,
                borderRadius: '12px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '1.5rem',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              className="edit-socials-btn"
            >
              <i className="bi bi-link-45deg"></i> Update Social Links
            </button>
          )}

          <p style={{
            ...styles.detailDescription,
            color: darkMode ? '#94a3b8' : '#333'
          }}>{campaign.description}</p>

          <div style={{
            ...styles.detailWallet,
            background: darkMode ? '#1e293b' : '#F9FAFB'
          }}>
            <span style={styles.detailWalletLabel}>Wallet Address</span>
            <code style={{
              ...styles.detailWalletAddress,
              background: darkMode ? '#0f172a' : 'white'
            }}>{campaign.walletAddress}</code>
          </div>

          <div style={styles.progressSection}>
            <div style={styles.progressStats}>
              <span style={styles.progressLabel}>Progress</span>
              <span style={styles.progressAmount}>
                {campaign.currentAmount} / {campaign.goalAmount} SOL
              </span>
            </div>
            <div style={styles.progressBarContainer}>
              <div style={{...styles.progressBar, width: `${progress}%`}} className="progress-fill" />
            </div>
          </div>

          <div style={styles.detailStats}>
            <div style={{
              ...styles.detailStatItem,
              background: darkMode ? '#1e293b' : '#F9FAFB'
            }}>
              <div style={styles.detailStatNumber}>{campaign.supporters}</div>
              <div style={styles.detailStatLabel}>Contributors</div>
            </div>
            <div style={{
              ...styles.detailStatItem,
              background: darkMode ? '#1e293b' : '#F9FAFB'
            }}>
              <div style={styles.detailStatNumber}>{Math.round(progress)}%</div>
              <div style={styles.detailStatLabel}>Funded</div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '3rem',
            flexWrap: 'wrap'
          }}>
            <button 
              onClick={() => onDonate(campaign)} 
              style={{
                ...styles.detailDonateBtn,
                flex: 1,
                minWidth: '200px',
                marginBottom: 0
              }} 
              className="donate-btn"
            >
              Make a Donation <i className="bi bi-balloon-heart"></i>
            </button>

            {isCreator && (
              <>
                <button 
                  onClick={() => onRedeem(campaign)} 
                  style={{
                    ...styles.detailDonateBtn,
                    background: '#10b981',
                    flex: 1,
                    minWidth: '200px',
                    marginBottom: 0
                  }} 
                  className="redeem-btn"
                >
                  Redeem Funds <i className="bi bi-piggy-bank"></i>
                </button>
                <button 
                  onClick={() => onDelete && onDelete(campaign.id)} 
                  style={{
                    ...styles.detailDonateBtn,
                    background: '#ef4444',
                    flex: 1,
                    minWidth: '200px',
                    marginBottom: 0
                  }} 
                  className="delete-btn"
                >
                  Delete Campaign <i className="bi bi-trash"></i>
                </button>
              </>
            )}
          </div>

          {/* Tabs Section */}
          <div style={styles.tabsContainer}>
            <div style={styles.tabsHeader}>
              <button
                onClick={() => setActiveTab('donations')}
                style={{
                  ...styles.tab,
                  ...(activeTab === 'donations' ? styles.tabActive : {}),
                  background: activeTab === 'donations' ? (darkMode ? '#334155' : '#7c3aed') : 'transparent',
                  color: activeTab === 'donations' ? (darkMode ? '#f1f5f9' : 'white') : (darkMode ? '#94a3b8' : '#666')
                }}
                className="tab-button"
              >
                <i className="bi bi-people"></i> Recent Donators ({campaign.recentDonations?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                style={{
                  ...styles.tab,
                  ...(activeTab === 'comments' ? styles.tabActive : {}),
                  background: activeTab === 'comments' ? (darkMode ? '#334155' : '#7c3aed') : 'transparent',
                  color: activeTab === 'comments' ? (darkMode ? '#f1f5f9' : 'white') : (darkMode ? '#94a3b8' : '#666')
                }}
                className="tab-button"
              >
                <i className="bi bi-chat-left-text"></i> Comments ({comments.length})
              </button>
            </div>

            {/* Donations Tab */}
            {activeTab === 'donations' && (
              <div style={styles.tabContent}>
                {campaign.recentDonations && campaign.recentDonations.length > 0 ? (
                  <div style={styles.donationsList}>
                    {campaign.recentDonations.slice(0, 10).map((donation, index) => (
                      <div key={index} style={{
                        ...styles.donationItem,
                        background: darkMode ? '#1e293b' : '#F9FAFB',
                        borderColor: darkMode ? '#334155' : '#F0EBE6'
                      }} className="donation-item">
                        <div style={styles.donationTop}>
                          <span style={{
                            ...styles.donationFrom,
                            color: darkMode ? '#94a3b8' : '#666'
                          }}>{donation.from}</span>
                          <span style={styles.donationAmount}>{donation.amount} SOL</span>
                        </div>
                        {donation.message && (
                          <p style={{
                            ...styles.donationMessage,
                            color: darkMode ? '#cbd5e1' : '#333'
                          }}>"{donation.message}"</p>
                        )}
                        <span style={{
                          ...styles.donationTime,
                          color: darkMode ? '#64748b' : '#999'
                        }}>{formatTime(donation.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{
                    ...styles.noDonations,
                    color: darkMode ? '#64748b' : '#999'
                  }}>No donations yet</p>
                )}
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <div style={styles.tabContent}>
                {/* Post Comment Box */}
                <div style={{
                  ...styles.commentBox,
                  background: darkMode ? '#1e293b' : '#F9FAFB',
                  borderColor: darkMode ? '#334155' : '#E5E7EB'
                }}>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={publicKey ? "Share your thoughts..." : "Connect your wallet to comment"}
                    disabled={!publicKey}
                    maxLength="500"
                    rows="3"
                    style={{
                      ...styles.commentInput,
                      background: darkMode ? '#0f172a' : 'white',
                      color: darkMode ? '#f1f5f9' : '#1A1A1A',
                      borderColor: darkMode ? '#334155' : '#E0E0E0'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      color: darkMode ? '#64748b' : '#999' 
                    }}>
                      {commentText.length}/500
                    </span>
                    <button
                      onClick={handlePostComment}
                      disabled={!publicKey || !commentText.trim() || loadingComment}
                      style={{
                        ...styles.postCommentBtn,
                        opacity: (!publicKey || !commentText.trim() || loadingComment) ? 0.5 : 1,
                        cursor: (!publicKey || !commentText.trim() || loadingComment) ? 'not-allowed' : 'pointer'
                      }}
                      className="post-comment-btn"
                    >
                      {loadingComment ? 'Posting...' : 'Post Comment'}
                    </button>
                  </div>
                </div>

                {/* Comments List */}
                {comments.length > 0 ? (
                  <div style={styles.commentsList}>
                    {comments.map((comment) => (
                      <div key={comment.id} style={{
                        ...styles.commentItem,
                        background: darkMode ? '#1e293b' : '#F9FAFB',
                        borderColor: darkMode ? '#334155' : '#F0EBE6'
                      }}>
                        <div style={styles.commentHeader}>
                          <span style={{
                            ...styles.commentWallet,
                            color: darkMode ? '#94a3b8' : '#666'
                          }}>
                            {comment.wallet.slice(0, 4)}...{comment.wallet.slice(-4)}
                          </span>
                          <span style={{
                            ...styles.commentTime,
                            color: darkMode ? '#64748b' : '#999'
                          }}>
                            {formatTime(comment.timestamp)}
                          </span>
                        </div>
                        <p style={{
                          ...styles.commentText,
                          color: darkMode ? '#cbd5e1' : '#333'
                        }}>{comment.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{
                    ...styles.noDonations,
                    color: darkMode ? '#64748b' : '#999'
                  }}>No comments yet. Be the first to comment!</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Socials Modal */}
      {showEditSocials && (
        <div style={styles.modalOverlay} onClick={() => setShowEditSocials(false)}>
          <div style={{
            ...styles.modal,
            background: darkMode ? '#1e293b' : 'white',
            color: darkMode ? '#f1f5f9' : '#1A1A1A'
          }} onClick={(e) => e.stopPropagation()} className="modal">
            <button onClick={() => setShowEditSocials(false)} style={{
              ...styles.closeBtn,
              background: darkMode ? '#334155' : '#F5F1ED',
              color: darkMode ? '#cbd5e1' : '#666'
            }} className="close-btn">✕</button>
            
            <div style={{
              ...styles.modalHeader,
              borderBottom: `1px solid ${darkMode ? '#334155' : '#F0EBE6'}`
            }}>
              <h2 style={{
                ...styles.modalTitle,
                color: darkMode ? '#f1f5f9' : '#1A1A1A'
              }}>Edit Social Links</h2>
              <p style={{
                ...styles.modalSubtitle,
                color: darkMode ? '#cbd5e1' : '#666'
              }}>Update your campaign's social media</p>
            </div>
            
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={{
                  ...styles.label,
                  color: darkMode ? '#f1f5f9' : '#1A1A1A'
                }}><i className="bi bi-twitter-x"></i> Twitter / X {campaign.twitter && <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✓ Added</span>}</label>
                <input
                  type="url"
                  value={socialsData.twitter}
                  onChange={(e) => setSocialsData({...socialsData, twitter: e.target.value})}
                  placeholder="https://twitter.com/username"
                  disabled={!!campaign.twitter}
                  style={{
                    ...styles.input,
                    background: campaign.twitter ? (darkMode ? '#1e293b' : '#f3f4f6') : (darkMode ? '#334155' : 'white'),
                    color: campaign.twitter ? (darkMode ? '#64748b' : '#9ca3af') : (darkMode ? '#f1f5f9' : '#1A1A1A'),
                    borderColor: darkMode ? '#4b5563' : '#E0E0E0',
                    cursor: campaign.twitter ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={{
                  ...styles.label,
                  color: darkMode ? '#f1f5f9' : '#1A1A1A'
                }}><i className="bi bi-telegram"></i> Telegram {campaign.telegram && <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✓ Added</span>}</label>
                <input
                  type="url"
                  value={socialsData.telegram}
                  onChange={(e) => setSocialsData({...socialsData, telegram: e.target.value})}
                  placeholder="https://t.me/username"
                  disabled={!!campaign.telegram}
                  style={{
                    ...styles.input,
                    background: campaign.telegram ? (darkMode ? '#1e293b' : '#f3f4f6') : (darkMode ? '#334155' : 'white'),
                    color: campaign.telegram ? (darkMode ? '#64748b' : '#9ca3af') : (darkMode ? '#f1f5f9' : '#1A1A1A'),
                    borderColor: darkMode ? '#4b5563' : '#E0E0E0',
                    cursor: campaign.telegram ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={{
                  ...styles.label,
                  color: darkMode ? '#f1f5f9' : '#1A1A1A'
                }}><i className="bi bi-globe"></i> Website {campaign.website && <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✓ Added</span>}</label>
                <input
                  type="url"
                  value={socialsData.website}
                  onChange={(e) => setSocialsData({...socialsData, website: e.target.value})}
                  placeholder="https://example.com"
                  disabled={!!campaign.website}
                  style={{
                    ...styles.input,
                    background: campaign.website ? (darkMode ? '#1e293b' : '#f3f4f6') : (darkMode ? '#334155' : 'white'),
                    color: campaign.website ? (darkMode ? '#64748b' : '#9ca3af') : (darkMode ? '#f1f5f9' : '#1A1A1A'),
                    borderColor: darkMode ? '#4b5563' : '#E0E0E0',
                    cursor: campaign.website ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              <button
                onClick={handleSaveSocials}
                style={{
                  ...styles.submitBtn,
                  marginTop: '1rem'
                }}
                className="submit-btn"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create Campaign Component
function CreateCampaign({ onClose, onCreate, darkMode }) {
  const { publicKey } = useWallet();
  const [formData, setFormData] = useState({
    name: '',
    type: 'person',
    image: '',
    description: '',
    goalAmount: '',
    twitter: '',
    telegram: '',
    website: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    const campaignId = Date.now();
    
    console.log('[CAMPAIGN-CREATE] Starting campaign creation, ID:', campaignId);
    
    try {
      // First, generate a campaign wallet
      console.log('[CAMPAIGN-CREATE] Step 1: Creating campaign wallet...');
      const walletResponse = await fetch('/api/create-campaign-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          campaignId: campaignId.toString(),
          creatorWallet: publicKey.toString()
        })
      });

      const walletData = await walletResponse.json();
      
      console.log('[CAMPAIGN-CREATE] Wallet API response:', walletResponse.status, walletData);

      if (!walletResponse.ok) {
        console.error('[CAMPAIGN-CREATE] ❌ Wallet creation failed:', walletData);
        alert(`Error creating campaign wallet: ${walletData.error || 'Unknown error'}. Please try again.`);
        return;
      }
      
      if (!walletData.campaignWallet) {
        console.error('[CAMPAIGN-CREATE] ❌ No wallet address in response:', walletData);
        alert('Error: No wallet address returned. Please try again.');
        return;
      }
      
      console.log('[CAMPAIGN-CREATE] ✅ Wallet created:', walletData.campaignWallet);

      const newCampaign = {
        id: campaignId,
        ...formData,
        avatar: formData.type === 'person' ? <i className="bi bi-person-badge"></i> : <i className="bi bi-balloon-heart"></i>,
        walletAddress: walletData.campaignWallet, // Generated wallet instead of user wallet
        creatorWallet: publicKey.toString(), // Store creator wallet separately
        currentAmount: 0,
        goalAmount: parseFloat(formData.goalAmount),
        supporters: 0,
        timeRemaining: '30 days',
        urgent: false,
        recentDonations: [],
        approved: false, // Needs admin approval
        fundsRedeemed: false,
        createdAt: Date.now(),
      };
      
      console.log('[CAMPAIGN-CREATE] Step 2: Saving campaign to database...');

      // Save campaign to API
      const response = await fetch('/api/create-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: newCampaign })
      });

      if (response.ok) {
        console.log('[CAMPAIGN-CREATE] ✅ Campaign created successfully:', campaignId);
        onCreate(newCampaign);
        onClose();
        alert('Campaign submitted for approval! An admin will review it shortly.');
      } else {
        const errorData = await response.json();
        console.error('[CAMPAIGN-CREATE] ❌ Campaign save failed:', errorData);
        alert(`Error creating campaign: ${errorData.error || 'Unknown error'}. Please try again.`);
      }
    } catch (error) {
      console.error('[CAMPAIGN-CREATE] ❌ Exception:', error);
      alert(`Error creating campaign: ${error.message}. Please try again.`);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{
        ...styles.modal,
        background: darkMode ? '#1e293b' : 'white',
        color: darkMode ? '#f1f5f9' : '#1A1A1A'
      }} onClick={(e) => e.stopPropagation()} className="modal">
        <button onClick={onClose} style={{
          ...styles.closeBtn,
          background: darkMode ? '#334155' : '#F5F1ED',
          color: darkMode ? '#cbd5e1' : '#666'
        }} className="close-btn">✕</button>
        
        <div style={{
          ...styles.modalHeader,
          borderBottom: `1px solid ${darkMode ? '#334155' : '#F0EBE6'}`
        }}>
          <h2 style={{
            ...styles.modalTitle,
            color: darkMode ? '#f1f5f9' : '#1A1A1A'
          }}>Create a Campaign</h2>
          <p style={{
            ...styles.modalSubtitle,
            color: darkMode ? '#cbd5e1' : '#666'
          }}>Share your project with the community</p>
        </div>
        
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Your name or organization"
              required
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            >
              <option value="person"><i className="bi bi-person-badge"></i> Person</option>
              <option value="charity"><i className="bi bi-balloon-heart"></i> Charity</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Photo URL *</label>
            <input
              type="url"
              value={formData.image}
              onChange={(e) => setFormData({...formData, image: e.target.value})}
              placeholder="https://example.com/image.jpg"
              required
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
            <span style={{
              ...styles.hint,
              color: darkMode ? '#94a3b8' : '#999'
            }}>Link to your profile photo</span>
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe your project..."
              required
              rows="4"
              style={{
                ...styles.textarea,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Goal (SOL) *</label>
            <input
              type="number"
              step="0.1"
              min="1"
              value={formData.goalAmount}
              onChange={(e) => setFormData({...formData, goalAmount: e.target.value})}
              placeholder="100"
              required
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Social Links (optional)</label>
            <span style={{
              ...styles.hint,
              color: darkMode ? '#94a3b8' : '#999',
              marginBottom: '0.5rem',
              display: 'block'
            }}>Add your social media links</span>
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}><i className="bi bi-twitter-x"></i> Twitter / X</label>
            <input
              type="url"
              value={formData.twitter}
              onChange={(e) => setFormData({...formData, twitter: e.target.value})}
              placeholder="https://twitter.com/username"
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}><i className="bi bi-telegram"></i> Telegram</label>
            <input
              type="url"
              value={formData.telegram}
              onChange={(e) => setFormData({...formData, telegram: e.target.value})}
              placeholder="https://t.me/username"
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}><i className="bi bi-globe"></i> Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({...formData, website: e.target.value})}
              placeholder="https://example.com"
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          {!publicKey && (
            <div style={{
              ...styles.walletWarning,
              background: darkMode ? '#334155' : '#FEF3C7',
              color: darkMode ? '#fbbf24' : '#92400E'
            }}>
              Connect your wallet to create a campaign
            </div>
          )}

          <button type="submit" disabled={!publicKey} style={styles.submitBtn} className="submit-btn">
            Submit Campaign
          </button>
          
          <p style={{
            ...styles.hint,
            color: darkMode ? '#94a3b8' : '#999'
          }}>Your campaign will be reviewed by an admin before going live.</p>
        </form>
      </div>
    </div>
  );
}

// Donation Modal Component
function DonationModal({ campaign, onClose, onSuccess, darkMode }) {
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleDonate = async () => {
    if (!publicKey) {
      setStatus('Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setStatus('Enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      setStatus('Preparing transaction...');

      console.log('Starting donation:', {
        from: publicKey.toString(),
        to: campaign.walletAddress,
        amount: parseFloat(amount),
        rpc: TRANSACTION_RPC
      });

      // Create direct connection to Transaction RPC (from config)
      const { Connection } = await import('@solana/web3.js');
      const connection = new Connection(TRANSACTION_RPC, 'confirmed');
      
      console.log('Using RPC:', TRANSACTION_RPC);

      // Get latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      console.log('Got blockhash:', blockhash);

      // Simple SOL transfer
      const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(campaign.walletAddress),
          lamports: lamports,
        })
      );

      console.log('Sending transaction...');
      setStatus('Sending transaction...');

      // Send transaction
      const signature = await sendTransaction(transaction, connection);

      console.log('Transaction sent! Signature:', signature);
      
      setStatus(`Transaction sent successfully! Signature: ${signature.slice(0, 8)}...`);

      // Don't wait for confirmation - let blockchain sync handle it
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, MODAL_CLOSE_DELAY);
      
    } catch (error) {
      console.error('Donation error:', error);
      
      // Check if it's a user rejection
      if (error.message?.includes('User rejected')) {
        setStatus('Transaction cancelled');
      } else {
        setStatus(`Error: ${error.message || 'Transaction failed. Please try again.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{
        ...styles.modal,
        background: darkMode ? '#1e293b' : 'white',
        color: darkMode ? '#f1f5f9' : '#1A1A1A'
      }} onClick={(e) => e.stopPropagation()} className="modal">
        <button onClick={onClose} style={{
          ...styles.closeBtn,
          background: darkMode ? '#334155' : '#F5F1ED',
          color: darkMode ? '#cbd5e1' : '#666'
        }} className="close-btn">✕</button>
        
        <div style={{
          ...styles.modalHeader,
          borderBottom: `1px solid ${darkMode ? '#334155' : '#F0EBE6'}`
        }}>
          <div style={styles.modalAvatar}>
            <img 
              src={campaign.image} 
              alt={campaign.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>
          <h2 style={{
            ...styles.modalTitle,
            color: darkMode ? '#f1f5f9' : '#1A1A1A'
          }}>Donate to {campaign.name}</h2>
          <p style={{
            ...styles.modalSubtitle,
            color: darkMode ? '#cbd5e1' : '#666'
          }}>
            {campaign.currentAmount} / {campaign.goalAmount} SOL raised
          </p>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Amount (SOL)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.0"
              style={{
                ...styles.input,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          <div style={styles.quickAmounts}>
            {QUICK_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => setAmount(amt.toString())}
                style={{
                  ...styles.quickBtn,
                  ...(amount === amt.toString() ? styles.quickBtnActive : {})
                }}
                className="quick-btn"
              >
                {amt} SOL
              </button>
            ))}
          </div>

          <div style={styles.formGroup}>
            <label style={{
              ...styles.label,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Leave a message of support..."
              maxLength="200"
              rows="3"
              style={{
                ...styles.textarea,
                background: darkMode ? '#334155' : 'white',
                color: darkMode ? '#f1f5f9' : '#1A1A1A',
                borderColor: darkMode ? '#4b5563' : '#E0E0E0'
              }}
            />
          </div>

          {!publicKey && (
            <div style={styles.walletWarning}>
              Connect your wallet to continue
            </div>
          )}

          <button
            onClick={handleDonate}
            disabled={loading || !publicKey}
            style={{
              ...styles.donateButton,
              opacity: loading || !publicKey ? 0.5 : 1,
              cursor: loading || !publicKey ? 'not-allowed' : 'pointer'
            }}
            className="donate-btn"
          >
            {loading ? 'Sending...' : 'Send Donation'} <i className="bi bi-balloon-heart"></i>
          </button>

          {status && (
            <div style={{
              ...styles.status,
              background: darkMode ? '#334155' : '#F5F1ED',
              color: darkMode ? '#cbd5e1' : '#1A1A1A'
            }}>{status}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Redeem Funds Modal Component
function RedeemFundsModal({ campaign, onClose, onSuccess, darkMode }) {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [walletInfo, setWalletInfo] = useState(null);

  useEffect(() => {
    // Load wallet info when modal opens
    const loadWalletInfo = async () => {
      try {
        const response = await fetch(`/api/get-campaign-wallet?campaignId=${campaign.id}`);
        const data = await response.json();
        if (response.ok) {
          setWalletInfo(data);
        }
      } catch (error) {
        console.error('Error loading wallet info:', error);
      }
    };
    
    loadWalletInfo();
  }, [campaign.id]);

  const handleRedeem = async () => {
    if (!publicKey) {
      setStatus('Please connect your wallet');
      return;
    }

    // VÉRIFICATION : L'utilisateur connecté doit être le créateur
    if (campaign.creatorWallet && publicKey.toString() !== campaign.creatorWallet) {
      setStatus('Unauthorized: You are not the creator of this campaign');
      return;
    }

    if (!walletInfo || walletInfo.currentBalance === 0) {
      setStatus('No funds available to redeem');
      return;
    }

    if (walletInfo.redeemed) {
      setStatus('Funds already redeemed');
      return;
    }
    
    // Double vérification avec les données du wallet
    if (walletInfo.creatorWallet && publicKey.toString() !== walletInfo.creatorWallet) {
      setStatus('Unauthorized: Wallet verification failed');
      return;
    }

    try {
      setLoading(true);
      setStatus('Processing redemption...');

      const response = await fetch('/api/redeem-funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.id.toString(),
          creatorWallet: publicKey.toString()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus(`Success! You received ${data.creatorReceived.toFixed(2)} SOL (${data.feePercentage}% platform fee: ${data.feeCollected.toFixed(4)} SOL)`);
        
        if (onSuccess) onSuccess();

        setTimeout(() => {
          onClose();
        }, 3000);
      } else {
        setStatus(`Error: ${data.error}`);
      }
      
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{
        ...styles.modal,
        background: darkMode ? '#1e293b' : 'white',
        color: darkMode ? '#f1f5f9' : '#1A1A1A'
      }} onClick={(e) => e.stopPropagation()} className="modal">
        <button onClick={onClose} style={{
          ...styles.closeBtn,
          background: darkMode ? '#334155' : '#F5F1ED',
          color: darkMode ? '#cbd5e1' : '#666'
        }} className="close-btn">✕</button>
        
        <div style={{
          ...styles.modalHeader,
          borderBottom: `1px solid ${darkMode ? '#334155' : '#F0EBE6'}`
        }}>
          <div style={styles.modalAvatar}>
            <img 
              src={campaign.image} 
              alt={campaign.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>
          <h2 style={{
            ...styles.modalTitle,
            color: darkMode ? '#f1f5f9' : '#1A1A1A'
          }}>Redeem Funds</h2>
          <p style={{
            ...styles.modalSubtitle,
            color: darkMode ? '#cbd5e1' : '#666'
          }}>
            {campaign.name}
          </p>
        </div>

        <div style={styles.modalBody}>
          {walletInfo ? (
            <>
              {/* Vérification créateur */}
              {publicKey && campaign.creatorWallet && publicKey.toString() !== campaign.creatorWallet && (
                <div style={{
                  ...styles.walletWarning,
                  background: darkMode ? '#7f1d1d' : '#FEE2E2',
                  color: darkMode ? '#fca5a5' : '#991B1B',
                  marginBottom: '1.5rem'
                }}>
                  You are not the creator of this campaign. Only the creator can redeem funds.
                </div>
              )}
              
              <div style={{
                ...styles.walletInfoBox,
                background: darkMode ? '#334155' : '#F9FAFB',
                borderColor: darkMode ? '#4b5563' : '#E5E7EB'
              }}>
                <div style={styles.infoRow}>
                  <span style={{
                    ...styles.infoLabel,
                    color: darkMode ? '#94a3b8' : '#6B7280'
                  }}>Campaign Wallet:</span>
                  <code style={{
                    ...styles.infoValue,
                    color: darkMode ? '#a78bfa' : '#7c3aed'
                  }}>{walletInfo.campaignWallet.slice(0, 8)}...{walletInfo.campaignWallet.slice(-8)}</code>
                </div>

                <div style={styles.infoRow}>
                  <span style={{
                    ...styles.infoLabel,
                    color: darkMode ? '#94a3b8' : '#6B7280'
                  }}>Available Balance:</span>
                  <span style={{
                    ...styles.infoValue,
                    color: darkMode ? '#10b981' : '#059669',
                    fontWeight: '700',
                    fontSize: '1.5rem'
                  }}>{walletInfo.currentBalance.toFixed(4)} SOL</span>
                </div>

                {walletInfo.redeemed && (
                  <div style={styles.infoRow}>
                    <span style={{
                      ...styles.infoLabel,
                      color: darkMode ? '#94a3b8' : '#6B7280'
                    }}>Status:</span>
                    <span style={{
                      ...styles.redeemedBadge,
                      background: darkMode ? '#065f46' : '#D1FAE5',
                      color: darkMode ? '#10b981' : '#065F46'
                    }}>✓ Already Redeemed</span>
                  </div>
                )}

                {walletInfo.currentBalance > 0 && !walletInfo.redeemed && (
                  <>
                    <div style={{
                      ...styles.separator,
                      borderColor: darkMode ? '#4b5563' : '#E5E7EB'
                    }} />
                    
                    <div style={styles.infoRow}>
                      <span style={{
                        ...styles.infoLabel,
                        color: darkMode ? '#94a3b8' : '#6B7280'
                      }}>You will receive (99%):</span>
                      <span style={{
                        ...styles.infoValue,
                        color: darkMode ? '#f1f5f9' : '#1A1A1A',
                        fontWeight: '700'
                      }}>{(walletInfo.currentBalance * 0.99).toFixed(4)} SOL</span>
                    </div>

                    <div style={styles.infoRow}>
                      <span style={{
                        ...styles.infoLabel,
                        color: darkMode ? '#94a3b8' : '#6B7280'
                      }}>Platform fee (1%):</span>
                      <span style={{
                        ...styles.infoValue,
                        color: darkMode ? '#fbbf24' : '#D97706'
                      }}>{(walletInfo.currentBalance * 0.01).toFixed(4)} SOL</span>
                    </div>
                  </>
                )}
              </div>

              {!publicKey && (
                <div style={{
                  ...styles.walletWarning,
                  background: darkMode ? '#334155' : '#FEF3C7',
                  color: darkMode ? '#fbbf24' : '#92400E'
                }}>
                  Connect your wallet to redeem funds
                </div>
              )}

              {walletInfo.redeemed ? (
                <div style={{
                  ...styles.successBox,
                  background: darkMode ? '#065f46' : '#D1FAE5',
                  color: darkMode ? '#10b981' : '#065F46'
                }}>
                  Funds have been redeemed on {new Date(walletInfo.redeemedAt).toLocaleString()}
                </div>
              ) : (
                <button
                  onClick={handleRedeem}
                  disabled={
                    loading || 
                    !publicKey || 
                    walletInfo.currentBalance === 0 ||
                    (campaign.creatorWallet && publicKey && publicKey.toString() !== campaign.creatorWallet)
                  }
                  style={{
                    ...styles.redeemButton,
                    opacity: (
                      loading || 
                      !publicKey || 
                      walletInfo.currentBalance === 0 ||
                      (campaign.creatorWallet && publicKey && publicKey.toString() !== campaign.creatorWallet)
                    ) ? 0.5 : 1,
                    cursor: (
                      loading || 
                      !publicKey || 
                      walletInfo.currentBalance === 0 ||
                      (campaign.creatorWallet && publicKey && publicKey.toString() !== campaign.creatorWallet)
                    ) ? 'not-allowed' : 'pointer',
                    background: '#10b981'
                  }}
                  className="redeem-btn"
                >
                  {loading ? 'Processing...' : 
                   !publicKey ? 'Connect Wallet' :
                   (campaign.creatorWallet && publicKey && publicKey.toString() !== campaign.creatorWallet) ? 'Not Creator' :
                   `Redeem ${walletInfo.currentBalance.toFixed(4)} SOL`}
                </button>
              )}

              {status && (
                <div style={{
                  ...styles.status,
                  background: darkMode ? '#334155' : '#F5F1ED',
                  color: darkMode ? '#cbd5e1' : '#1A1A1A'
                }}>{status}</div>
              )}
            </>
          ) : (
            <div style={styles.loadingBox}>Loading wallet info...</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Campaign Card Component
function CampaignCard({ campaign, onView, onDonate, darkMode }) {
  const progress = Math.min((campaign.currentAmount / campaign.goalAmount) * 100, 100);

  return (
    <div style={{
      ...styles.card,
      background: darkMode ? '#1e293b' : 'white',
      borderColor: darkMode ? '#334155' : 'transparent',
      color: darkMode ? '#f1f5f9' : '#1A1A1A'
    }} className="campaign-card" onClick={() => onView(campaign)}>
      <div style={{
        ...styles.cardHeader,
        borderBottom: `1px solid ${darkMode ? '#334155' : '#F0EBE6'}`
      }}>
        <div style={styles.avatar}>
          <img 
            src={campaign.image} 
            alt={campaign.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </div>
        <div style={styles.cardInfo}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start',
            marginBottom: '0.25rem'
          }}>
            <div style={{
              ...styles.cardName,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>{campaign.name}</div>
            
            {/* Social Icons */}
            {(campaign.twitter || campaign.telegram || campaign.website) && (
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.5rem' }}>
                {campaign.twitter && (
                  <a 
                    href={campaign.twitter} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: darkMode ? '#94a3b8' : '#666',
                      fontSize: '1.1rem',
                      transition: 'color 0.2s'
                    }}
                    className="social-icon"
                  >
                    <i className="bi bi-twitter-x"></i>
                  </a>
                )}
                {campaign.telegram && (
                  <a 
                    href={campaign.telegram} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: darkMode ? '#94a3b8' : '#666',
                      fontSize: '1.1rem',
                      transition: 'color 0.2s'
                    }}
                    className="social-icon"
                  >
                    <i className="bi bi-telegram"></i>
                  </a>
                )}
                {campaign.website && (
                  <a 
                    href={campaign.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: darkMode ? '#94a3b8' : '#666',
                      fontSize: '1.1rem',
                      transition: 'color 0.2s'
                    }}
                    className="social-icon"
                  >
                    <i className="bi bi-globe"></i>
                  </a>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              ...styles.cardType,
              ...(campaign.type === 'charity' ? styles.cardTypeCharity : styles.cardTypePerson)
            }}>
              {campaign.type === 'charity' ? (
                <><i className="bi bi-balloon-heart"></i> Charity</>
              ) : (
                <><i className="bi bi-person-badge"></i> Person</>
              )}
            </span>
            
            {/* Redeem Status Badge */}
            {campaign.fundsRedeemed !== undefined && (
              <span style={{
                ...styles.cardType,
                ...(campaign.fundsRedeemed ? {
                  background: darkMode ? '#7f1d1d' : '#FEE2E2',
                  color: darkMode ? '#fca5a5' : '#991B1B'
                } : {
                  background: darkMode ? '#065f46' : '#D1FAE5',
                  color: darkMode ? '#6ee7b7' : '#065F46'
                })
              }}>
                {campaign.fundsRedeemed ? (
                  <><i className="bi bi-check-square"></i> Campaign funds redeemed</>
                ) : (
                  <><i className="bi bi-x-square"></i> Campaign funds not redeemed</>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.cardBody}>
        <p style={{
          ...styles.description,
          color: darkMode ? '#cbd5e1' : '#666'
        }}>{campaign.description}</p>

        <div style={styles.progressSection}>
          <div style={styles.progressStats}>
            <span style={{
              ...styles.progressLabel,
              color: darkMode ? '#94a3b8' : '#666'
            }}>Progress</span>
            <span style={styles.progressAmount}>
              {campaign.currentAmount} / {campaign.goalAmount} SOL
            </span>
          </div>
          <div style={styles.progressBarContainer}>
            <div style={{...styles.progressBar, width: `${progress}%`}} className="progress-fill" />
          </div>
        </div>
      </div>

      <div style={{
        ...styles.cardFooter,
        background: darkMode ? '#334155' : '#FAFAFA'
      }}>
        <div style={styles.supporters}>
          <span style={{
            ...styles.supportersCount,
            color: darkMode ? '#cbd5e1' : '#666'
          }}>{campaign.supporters} contributors</span>
        </div>
        <button 
          style={styles.donateBtn} 
          className="donate-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDonate(campaign);
          }}
        >
          Donate <i className="bi bi-balloon-heart"></i>
        </button>
      </div>
    </div>
  );
}

// Main App Component
function CoffeeCampaignsApp() {
  const { publicKey, signMessage } = useWallet();
  const [campaigns, setCampaigns] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDonate, setShowDonate] = useState(null);
  const [showRedeem, setShowRedeem] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [view, setView] = useState('grid');
  const [darkMode, setDarkMode] = useState(DEFAULT_DARK_MODE);

  // Enable blockchain sync - automatically checks every 30 seconds
  const { syncStatus, syncNow } = useBlockchainSync(true);

  // Load campaigns on mount and after sync updates
  useEffect(() => {
    loadCampaigns().then(setCampaigns);
  }, []);

  // Reload campaigns when blockchain sync updates data
  useEffect(() => {
    if (syncStatus.updated > 0) {
      loadCampaigns().then(setCampaigns);
    }
  }, [syncStatus.updated]);

  // Toggle dark mode class on body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Check if current wallet is admin
  const isAdmin = publicKey?.toString() === ADMIN_WALLET;

  // Handle campaign deletion with wallet signature
  const handleDeleteCampaign = async (campaignId) => {
    if (!publicKey) {
      alert('Please connect your wallet');
      return;
    }

    if (!signMessage) {
      alert('Your wallet does not support message signing. Please use Phantom or Solflare.');
      return;
    }

    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      console.log('[DELETE] Requesting signature from wallet...');

      // Create message to sign
      const timestamp = Date.now();
      const message = `Delete Campaign\nCampaign ID: ${campaignId}\nTimestamp: ${timestamp}\nWallet: ${publicKey.toString()}`;
      
      // Request signature from wallet
      const messageBytes = new TextEncoder().encode(message);
      let signature;
      
      try {
        const signatureUint8 = await signMessage(messageBytes);
        
        // Convert signature to base58
        const bs58 = await import('bs58');
        signature = bs58.default.encode(signatureUint8);
        
        console.log('[DELETE] ✅ Signature obtained');
      } catch (signError) {
        console.error('[DELETE] Signature rejected:', signError);
        alert('Signature rejected. Campaign deletion cancelled.');
        return;
      }

      // Send delete request with signature
      const response = await fetch('/api/delete-campaign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          walletAddress: publicKey.toString(),
          signature: signature,
          message: message,
          timestamp: timestamp
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[DELETE] ✅ Campaign deleted by ${data.deletedBy}`);
        
        // Reload campaigns from server to ensure sync
        const freshCampaigns = await loadCampaigns();
        setCampaigns(freshCampaigns);
        
        console.log(`[DELETE] Campaigns reloaded from server: ${freshCampaigns.length} total`);
        
        // Go back to campaign list
        setSelectedCampaign(null);
        
        alert('Campaign deleted successfully');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Error deleting campaign. Please try again.');
    }
  };

  const approvedCampaigns = campaigns.filter(c => c.approved);

  const filteredCampaigns = useMemo(() => {
    if (filter === 'all') return approvedCampaigns;
    if (filter === 'person') return approvedCampaigns.filter(c => c.type === 'person');
    if (filter === 'charity') return approvedCampaigns.filter(c => c.type === 'charity');
    return approvedCampaigns;
  }, [filter, approvedCampaigns]);

  const handleCreateCampaign = (newCampaign) => {
    setCampaigns([...campaigns, newCampaign]);
  };

  const handleViewCampaign = (campaign) => {
    setSelectedCampaign(campaign);
    setView('detail');
  };

  const handleBack = () => {
    setView('grid');
    setSelectedCampaign(null);
  };

  const handleDonationSuccess = async () => {
    const updated = await loadCampaigns();
    setCampaigns(updated);
  };

  if (view === 'detail' && selectedCampaign) {
    return (
      <div style={{
        ...styles.app,
        ...(darkMode ? styles.appDark : {})
      }}>
        <CampaignDetail 
          campaign={selectedCampaign} 
          onBack={handleBack}
          onDonate={(c) => setShowDonate(c)}
          onRedeem={(c) => setShowRedeem(c)}
          onDelete={handleDeleteCampaign}
          darkMode={darkMode}
          publicKey={publicKey}
          signMessage={signMessage}
        />
        {showDonate && (
          <DonationModal 
            campaign={showDonate} 
            onClose={() => setShowDonate(null)}
            onSuccess={handleDonationSuccess}
            darkMode={darkMode}
          />
        )}
        {showRedeem && (
          <RedeemFundsModal 
            campaign={showRedeem} 
            onClose={() => setShowRedeem(null)}
            onSuccess={handleDonationSuccess}
            darkMode={darkMode}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{
      ...styles.app,
      ...(darkMode ? styles.appDark : {})
    }}>
      {/* Hero Section */}
      <div style={{
        ...styles.hero,
        ...(darkMode ? {background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'} : {})
      }}>
        <div style={styles.heroContainer} className="hero-container">
          {/* Left Content */}
          <div style={styles.heroContent}>
            <div style={{display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap'}}>
              <div style={styles.badge}>
                <span>⚡</span> Powered by Solana
              </div>
              <button 
                onClick={() => setDarkMode(!darkMode)} 
                style={{
                  padding: '0.5rem 1rem',
                  background: darkMode ? '#1f2937' : 'white',
                  color: darkMode ? '#f1f5f9' : '#1A1A1A',
                  border: `2px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '50px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  height: 'fit-content',
                }}
                className="dark-mode-btn"
              >
                {darkMode ? <><i className="bi bi-sun"></i> Light</> : <><i className="bi bi-moon-stars"></i> Dark</>}
              </button>
            </div>
            <h1 style={{
              ...styles.heroTitle,
              color: darkMode ? '#f1f5f9' : '#1A1A1A'
            }}>
              Support your favorite <span style={styles.highlight}>cause</span>
            </h1>
            <p style={{
              ...styles.heroSubtitle,
              color: darkMode ? '#cbd5e1' : '#666'
            }}>
              Send micro-donations in seconds. Zero fees, instant transactions, 100% goes to the creator.
            </p>
            
            <div style={styles.ctaGroup}>
              <button onClick={() => setShowCreate(true)} style={styles.btnPrimary} className="btn-primary">
                Create Campaign
              </button>
              <WalletMultiButton />
              {isAdmin && (
                <button onClick={() => setShowAdmin(true)} style={styles.adminBtn} className="admin-btn">
                  Admin Panel
                </button>
              )}
            </div>

            {/* Blockchain Sync Status */}
            {syncStatus.syncing && (
              <div style={styles.syncStatus}>
                <span style={styles.syncDot}>●</span> Syncing blockchain...
              </div>
            )}
            {syncStatus.lastSync && !syncStatus.syncing && (
              <div style={styles.syncStatus}>
                <span style={{...styles.syncDot, color: '#10B981'}}>●</span> 
                Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Right Side - Mockup */}
          <div style={styles.mockupContainer}>
            <div style={styles.scene}>
              {/* Phone */}
              <div className="phone-mockup" style={styles.phone}>
                <div style={styles.phoneScreen}>
                  <div style={styles.screenContent}>
                    <img 
                      src="https://www.wateraid.org/au/sites/g/files/jkxoof231/files/styles/full_grid_image/public/wateraids-new-logo.webp?itok=oA3JIR7L" 
                      alt="WaterAid"
                      style={styles.screenLogo}
                    />
                    <div style={styles.screenTitle}>WaterAid</div>
                    <div style={styles.screenSubtitle}>Charity</div>
                    
                    <div style={styles.donationAmounts}>
                      <button className="amount-btn" style={styles.amountBtn}>0.5 SOL</button>
                      <button className="amount-btn" style={{...styles.amountBtn, ...styles.amountBtnActive}}>1 SOL</button>
                      <button className="amount-btn" style={styles.amountBtn}>2 SOL</button>
                      <button className="amount-btn" style={styles.amountBtn}>5 SOL</button>
                    </div>
                    
                    <button className="send-btn" style={styles.sendBtn}>Send Donation <i className="bi bi-balloon-heart"></i></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>{approvedCampaigns.length}</div>
            <div style={styles.statLabel}>Active Campaigns</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>
              {approvedCampaigns.reduce((sum, c) => sum + c.supporters, 0)}
            </div>
            <div style={styles.statLabel}>Total Contributors</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statNumber}>0 SOL</div>
            <div style={styles.statLabel}>Platform Fees</div>
          </div>
        </div>
      </div>

      {/* Campaigns Section */}
      <section style={{
        ...styles.campaignsSection,
        background: darkMode ? '#1e293b' : 'white',
        color: darkMode ? '#f1f5f9' : '#1A1A1A'
      }}>
        <div style={styles.sectionHeader}>
          <h2 style={{
            ...styles.sectionTitle,
            color: darkMode ? '#f1f5f9' : '#1A1A1A'
          }}>Active Campaigns</h2>
          <p style={{
            ...styles.sectionDescription,
            color: darkMode ? '#cbd5e1' : '#666'
          }}>
            Discover creators and charities that need your support
          </p>
        </div>

        {/* Filter Tabs */}
        <div style={styles.filterTabs}>
          {[
            { value: 'all', label: 'All' },
            { value: 'person', label: 'Person' },
            { value: 'charity', label: 'Charities' }
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className="filter-tab"
              style={{
                ...styles.filterTab,
                ...(filter === tab.value ? styles.filterTabActive : {}),
                background: darkMode && filter !== tab.value ? '#334155' : (filter === tab.value ? '#7c3aed' : '#F5F1ED'),
                color: darkMode && filter !== tab.value ? '#cbd5e1' : (filter === tab.value ? 'white' : '#666')
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Campaigns Grid */}
        <div style={styles.campaignsGrid}>
          {filteredCampaigns.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No campaigns available yet. Be the first to create one!</p>
            </div>
          ) : (
            filteredCampaigns.map(campaign => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onView={handleViewCampaign}
                onDonate={setShowDonate}
                darkMode={darkMode}
              />
            ))
          )}
        </div>
      </section>

      {/* Modals */}
      {showCreate && (
        <CreateCampaign 
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateCampaign}
          darkMode={darkMode}
        />
      )}

      {showDonate && (
        <DonationModal 
          campaign={showDonate} 
          onClose={() => setShowDonate(null)}
          onSuccess={handleDonationSuccess}
          darkMode={darkMode}
        />
      )}

      {showAdmin && isAdmin && (
        <AdminPanel
          campaigns={campaigns}
          onUpdateCampaigns={setCampaigns}
          onClose={() => setShowAdmin(false)}
          darkMode={darkMode}
          publicKey={publicKey}
          signMessage={signMessage}
        />
      )}
    </div>
  );
}

// App with Providers
export default function App() {
  const endpoint = useMemo(() => SOLANA_RPC, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <CoffeeCampaignsApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// Styles
const styles = {
  app: {
    fontFamily: "'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    background: 'linear-gradient(135deg, #FAFAFA 0%, #F0EBE6 100%)',
    minHeight: '100vh',
    color: '#1A1A1A',
  },
  
  hero: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  heroContainer: {
    maxWidth: '1400px',
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4rem',
    alignItems: 'center',
  },
  heroContent: {
    maxWidth: '600px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'white',
    padding: '0.5rem 1.25rem',
    borderRadius: '50px',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#6F4E37',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  },
  heroTitle: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
    fontWeight: '700',
    lineHeight: '1.1',
    marginBottom: '1.5rem',
    color: '#1A1A1A',
  },
  highlight: {
    color: '#7c3aed',
    position: 'relative',
  },
  heroSubtitle: {
    fontSize: '1.25rem',
    lineHeight: '1.8',
    color: '#666',
    marginBottom: '3rem',
  },
  ctaGroup: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    padding: '1rem 2.5rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontWeight: '600',
    fontSize: '1rem',
    cursor: 'pointer',
    boxShadow: '0 10px 30px rgba(124, 58, 237, 0.3)',
    transition: 'all 0.3s',
  },
  adminBtn: {
    padding: '1rem 2.5rem',
    background: '#1f2937',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontWeight: '600',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  
  mockupContainer: {
    position: 'relative',
    perspective: '1000px',
  },
  scene: {
    position: 'relative',
    width: '100%',
    height: '600px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    position: 'relative',
    width: '280px',
    height: '580px',
    background: '#1A1A1A',
    borderRadius: '40px',
    padding: '12px',
    boxShadow: '0 50px 100px rgba(0, 0, 0, 0.25), 0 20px 40px rgba(0, 0, 0, 0.15)',
    transform: 'rotateY(-15deg) rotateX(5deg)',
    zIndex: 2,
  },
  phoneScreen: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #FFFFFF 0%, #F8F8F8 100%)',
    borderRadius: '32px',
    overflow: 'hidden',
    boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.05)',
  },
  screenContent: {
    padding: '3rem 2rem',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  screenLogo: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
    marginBottom: '1rem',
    borderRadius: '8px',
  },
  coffeeIcon: {
    fontSize: '4rem',
    marginBottom: '1rem',
  },
  screenTitle: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: '0.5rem',
  },
  screenSubtitle: {
    fontSize: '0.875rem',
    color: '#666',
    marginBottom: '2rem',
  },
  donationAmounts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
    width: '100%',
    marginBottom: '1.5rem',
  },
  amountBtn: {
    background: 'white',
    border: '2px solid #E0E0E0',
    padding: '1rem',
    borderRadius: '12px',
    fontWeight: '600',
    color: '#1A1A1A',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.3s',
  },
  amountBtnActive: {
    borderColor: '#7c3aed',
    background: '#7c3aed',
    color: 'white',
  },
  sendBtn: {
    width: '100%',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    padding: '1rem',
    borderRadius: '12px',
    fontWeight: '600',
    fontSize: '1rem',
  },
  
  stats: {
    display: 'flex',
    gap: '3rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: '4rem',
  },
  statItem: {
    textAlign: 'center',
  },
  statNumber: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '2.5rem',
    fontWeight: '700',
    color: '#7c3aed',
    lineHeight: '1',
    marginBottom: '0.25rem',
  },
  statLabel: {
    fontSize: '0.875rem',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  
  campaignsSection: {
    padding: '6rem 2rem',
    background: 'white',
  },
  sectionHeader: {
    maxWidth: '1400px',
    margin: '0 auto 4rem',
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: 'clamp(2rem, 4vw, 3rem)',
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: '1rem',
  },
  sectionDescription: {
    fontSize: '1.125rem',
    color: '#666',
  },
  
  filterTabs: {
    maxWidth: '1400px',
    margin: '0 auto 3rem',
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  filterTab: {
    padding: '0.75rem 1.5rem',
    background: '#F5F1ED',
    border: 'none',
    borderRadius: '50px',
    fontWeight: '600',
    color: '#666',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  filterTabActive: {
    background: '#7c3aed',
    color: 'white',
  },
  
  campaignsGrid: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '2rem',
  },

  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '4rem 2rem',
  },
  emptyText: {
    fontSize: '1.125rem',
    color: '#999',
  },
  
  card: {
    background: 'white',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    transition: 'all 0.4s',
    cursor: 'pointer',
    border: '2px solid transparent',
  },
  cardHeader: {
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    borderBottom: '1px solid #F0EBE6',
  },
  avatar: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    flexShrink: 0,
    overflow: 'hidden',
    border: '2px solid #e5e7eb',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontWeight: '700',
    fontSize: '1.125rem',
    color: '#1A1A1A',
    marginBottom: '0.25rem',
  },
  cardType: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.875rem',
    padding: '0.25rem 0.75rem',
    borderRadius: '50px',
  },
  cardTypeCharity: {
    background: '#FEE2E2',
    color: '#991B1B',
  },
  cardTypePerson: {
    background: '#E9D5FF',
    color: '#6B21A8',
  },
  cardBody: {
    padding: '1.5rem',
  },
  description: {
    color: '#666',
    lineHeight: '1.6',
    marginBottom: '1.5rem',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  progressSection: {
    marginBottom: '1rem',
  },
  progressStats: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
  },
  progressLabel: {
    color: '#666',
  },
  progressAmount: {
    fontWeight: '700',
    color: '#7c3aed',
  },
  progressBarContainer: {
    height: '8px',
    background: '#F0EBE6',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
    borderRadius: '10px',
    transition: 'width 1s ease-out',
    position: 'relative',
  },
  cardFooter: {
    padding: '1.5rem',
    background: '#FAFAFA',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  supporters: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  supportersCount: {
    fontSize: '0.875rem',
    color: '#666',
  },
  donateBtn: {
    padding: '0.75rem 1.5rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  
  // Detail View
  detailContainer: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '4rem 2rem',
  },
  backButton: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    color: '#666',
    cursor: 'pointer',
    padding: '0.5rem 0',
    marginBottom: '3rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.5fr',
    gap: '4rem',
  },
  detailImageSection: {
    position: 'sticky',
    top: '2rem',
    height: 'fit-content',
  },
  detailImage: {
    width: '100%',
    height: '0',
    paddingTop: '80%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    position: 'relative',
    overflow: 'hidden',
  },
  detailInfo: {},
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  detailAvatar: {
    width: '80px',
    height: '80px',
    borderRadius: '8px',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    flexShrink: 0,
    overflow: 'hidden',
    border: '2px solid #e5e7eb',
  },
  detailName: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '2.5rem',
    fontWeight: '700',
    margin: '0 0 0.5rem',
    letterSpacing: '-0.02em',
  },
  detailType: {
    fontSize: '0.875rem',
    padding: '0.5rem 1rem',
    borderRadius: '50px',
    display: 'inline-block',
  },
  detailTypePerson: {
    background: '#E9D5FF',
    color: '#6B21A8',
  },
  detailTypeCharity: {
    background: '#FEE2E2',
    color: '#991B1B',
  },
  detailDescription: {
    fontSize: '1.125rem',
    lineHeight: '1.8',
    color: '#333',
    marginBottom: '2rem',
  },
  detailWallet: {
    padding: '1.5rem',
    background: '#F9FAFB',
    borderRadius: '12px',
    marginBottom: '2rem',
  },
  detailWalletLabel: {
    display: 'block',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#999',
    marginBottom: '0.75rem',
    fontWeight: '600',
  },
  detailWalletAddress: {
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    color: '#7c3aed',
    wordBreak: 'break-all',
    background: 'white',
    padding: '0.75rem',
    borderRadius: '6px',
    display: 'block',
  },
  detailStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  detailStatItem: {
    textAlign: 'center',
    padding: '1.5rem',
    background: '#F9FAFB',
    borderRadius: '12px',
  },
  detailStatNumber: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '2rem',
    fontWeight: '700',
    color: '#7c3aed',
    marginBottom: '0.5rem',
  },
  detailStatLabel: {
    fontSize: '0.875rem',
    color: '#666',
  },
  detailDonateBtn: {
    width: '100%',
    padding: '1.25rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1.125rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '3rem',
    boxShadow: '0 10px 30px rgba(124, 58, 237, 0.3)',
    transition: 'all 0.3s',
  },
  
  recentDonations: {
    borderTop: '2px solid #F0EBE6',
    paddingTop: '2rem',
  },
  recentTitle: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '1.5rem',
    fontWeight: '700',
    margin: '0 0 1.5rem',
  },
  donationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  donationItem: {
    padding: '1.25rem',
    background: '#F9FAFB',
    borderRadius: '12px',
    border: '1px solid #F0EBE6',
    transition: 'all 0.3s',
  },
  donationTop: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    alignItems: 'center',
  },
  donationFrom: {
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    color: '#666',
  },
  donationAmount: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#7c3aed',
  },
  donationMessage: {
    fontSize: '0.9375rem',
    fontStyle: 'italic',
    color: '#333',
    margin: '0.75rem 0',
    lineHeight: '1.6',
  },
  donationTime: {
    fontSize: '0.75rem',
    color: '#999',
  },
  noDonations: {
    fontSize: '0.9375rem',
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '2rem',
  },
  
  // Tabs
  tabsContainer: {
    marginTop: '3rem',
    borderTop: '2px solid #F0EBE6',
    paddingTop: '2rem',
  },
  tabsHeader: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '2rem',
    borderBottom: '2px solid #F0EBE6',
  },
  tab: {
    flex: 1,
    padding: '1rem',
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: '8px 8px 0 0',
  },
  tabActive: {
    borderBottomColor: '#7c3aed',
  },
  tabContent: {
    minHeight: '300px',
  },
  
  // Comments
  commentBox: {
    padding: '1.5rem',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
    marginBottom: '2rem',
  },
  commentInput: {
    width: '100%',
    padding: '0.75rem',
    border: '2px solid #E0E0E0',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '80px',
  },
  postCommentBtn: {
    padding: '0.625rem 1.5rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  commentItem: {
    padding: '1.25rem',
    background: '#F9FAFB',
    borderRadius: '12px',
    border: '1px solid #F0EBE6',
  },
  commentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  commentWallet: {
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  commentTime: {
    fontSize: '0.75rem',
  },
  commentText: {
    fontSize: '0.95rem',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
  },
  
  // Modals
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '2rem',
  },
  modal: {
    background: 'white',
    borderRadius: '24px',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    zIndex: 10000,  // Ajouter cette ligne
  },
  closeBtn: {
    position: 'absolute',
    top: '1.5rem',
    right: '1.5rem',
    background: '#F5F1ED',
    border: 'none',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    fontSize: '1.5rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s',
    color: '#666',
    zIndex: 10,
  },
  modalHeader: {
    padding: '3rem 2rem 1.5rem',
    textAlign: 'center',
    borderBottom: '1px solid #F0EBE6',
  },
  modalAvatar: {
    width: '80px',
    height: '80px',
    borderRadius: '8px',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    margin: '0 auto 1rem',
    overflow: 'hidden',
    border: '2px solid #e5e7eb',
  },
  modalTitle: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: '0.5rem',
  },
  modalSubtitle: {
    fontSize: '0.9375rem',
    color: '#666',
  },
  modalBody: {
    padding: '2rem',
  },
  form: {
    padding: '2rem',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '600',
    color: '#1A1A1A',
    fontSize: '0.875rem',
  },
  input: {
    width: '100%',
    padding: '1rem',
    border: '2px solid #E0E0E0',
    borderRadius: '12px',
    fontSize: '1rem',
    transition: 'all 0.3s',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    padding: '1rem',
    border: '2px solid #E0E0E0',
    borderRadius: '12px',
    fontSize: '1rem',
    minHeight: '100px',
    resize: 'vertical',
    fontFamily: 'inherit',
    transition: 'all 0.3s',
  },
  hint: {
    fontSize: '0.75rem',
    color: '#999',
    marginTop: '0.5rem',
    display: 'block',
  },
  quickAmounts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  quickBtn: {
    padding: '0.75rem',
    background: 'white',
    border: '2px solid #E0E0E0',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  quickBtnActive: {
    background: '#7c3aed',
    color: 'white',
    borderColor: '#7c3aed',
  },
  walletWarning: {
    padding: '1rem',
    background: '#FEF3C7',
    borderRadius: '10px',
    marginBottom: '1rem',
    textAlign: 'center',
    fontWeight: '600',
    color: '#92400E',
    fontSize: '0.875rem',
  },
  submitBtn: {
    width: '100%',
    padding: '1rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  donateButton: {
    width: '100%',
    padding: '1rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  status: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#F5F1ED',
    borderRadius: '10px',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: '0.875rem',
  },

  // Admin Panel
  adminPanel: {
    background: 'white',
    borderRadius: '24px',
    maxWidth: '900px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    padding: '2rem',
  },
  adminTitle: {
    fontFamily: "'Google Sans', sans-serif",
    fontSize: '2rem',
    fontWeight: '700',
    marginBottom: '2rem',
    textAlign: 'center',
  },
  adminSection: {
    marginBottom: '3rem',
  },
  sectionSubtitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1.5rem',
    color: '#374151',
  },
  campaignsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  adminCard: {
    padding: '1.5rem',
    background: '#F9FAFB',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
  },
  adminCardHeader: {
    marginBottom: '0.75rem',
  },
  adminCardType: {
    fontSize: '0.875rem',
    color: '#6B7280',
  },
  adminCardDesc: {
    fontSize: '0.9375rem',
    color: '#4B5563',
    marginBottom: '1rem',
    lineHeight: '1.6',
  },
  adminCardInfo: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.875rem',
    color: '#6B7280',
    marginBottom: '1rem',
  },
  adminActions: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  approveBtn: {
    padding: '0.5rem 1rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editBtn: {
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteBtn: {
    padding: '0.5rem 1rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveBtn: {
    padding: '0.75rem 1.5rem',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cancelBtn: {
    padding: '0.75rem 1.5rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editForm: {
    padding: '2rem',
  },
  
  // Sync status
  syncStatus: {
    marginTop: '1rem',
    fontSize: '0.875rem',
    color: '#6B7280',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  syncDot: {
    color: '#7c3aed',
    fontSize: '1.5rem',
    lineHeight: '0',
  },
  
  // Dark Mode Styles
  appDark: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    color: '#f1f5f9',
  },
  
  // Redeem Modal Styles
  walletInfoBox: {
    padding: '1.5rem',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
    marginBottom: '1.5rem',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  infoLabel: {
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: '1rem',
    fontFamily: 'monospace',
  },
  separator: {
    borderTop: '1px solid #E5E7EB',
    margin: '1rem 0',
  },
  redeemedBadge: {
    padding: '0.375rem 0.75rem',
    borderRadius: '50px',
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  redeemButton: {
    width: '100%',
    padding: '1rem',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
    marginBottom: '1rem',
  },
  successBox: {
    padding: '1rem',
    borderRadius: '10px',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  loadingBox: {
    padding: '3rem',
    textAlign: 'center',
    color: '#999',
  },
};