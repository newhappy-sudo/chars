import React, { useState, useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

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
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [enabled, syncBlockchain]);

  return {
    syncStatus,
    syncNow: syncBlockchain
  };
}

// Admin wallet address - CHANGE THIS TO YOUR ADMIN WALLET
const ADMIN_WALLET = "Dw4fA9TdY68Kune3yWpkfCp8R7JY8FaQtMyKgyU3N4Q7";

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
function AdminPanel({ campaigns, onUpdateCampaigns, onClose, darkMode }) {
  const [editingCampaign, setEditingCampaign] = useState(null);

  const handleDelete = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    
    const updated = campaigns.filter(c => c.id !== campaignId);
    await saveCampaigns(updated);
    onUpdateCampaigns(updated);
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
      <div style={styles.adminPanel} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={styles.closeBtn} className="close-btn">✕</button>
        
        <h2 style={styles.adminTitle}>Admin Panel</h2>

        {editingCampaign ? (
          <div style={styles.editForm}>
            <h3>Edit Campaign</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input
                type="text"
                value={editingCampaign.name}
                onChange={(e) => setEditingCampaign({...editingCampaign, name: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                value={editingCampaign.description}
                onChange={(e) => setEditingCampaign({...editingCampaign, description: e.target.value})}
                style={styles.textarea}
                rows="4"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Goal Amount (SOL)</label>
              <input
                type="number"
                value={editingCampaign.goalAmount}
                onChange={(e) => setEditingCampaign({...editingCampaign, goalAmount: parseFloat(e.target.value)})}
                style={styles.input}
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
              <h3 style={styles.sectionSubtitle}>Pending Approval ({pendingCampaigns.length})</h3>
              {pendingCampaigns.length === 0 ? (
                <p style={styles.emptyText}>No pending campaigns</p>
              ) : (
                <div style={styles.campaignsList}>
                  {pendingCampaigns.map(campaign => (
                    <div key={campaign.id} style={styles.adminCard}>
                      <div style={styles.adminCardHeader}>
                        <div>
                          <strong>{campaign.name}</strong>
                          <span style={styles.adminCardType}> - {campaign.type}</span>
                        </div>
                      </div>
                      <p style={styles.adminCardDesc}>{campaign.description}</p>
                      <div style={styles.adminCardInfo}>
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
              <h3 style={styles.sectionSubtitle}>Active Campaigns ({approvedCampaigns.length})</h3>
              {approvedCampaigns.length === 0 ? (
                <p style={styles.emptyText}>No active campaigns</p>
              ) : (
                <div style={styles.campaignsList}>
                  {approvedCampaigns.map(campaign => (
                    <div key={campaign.id} style={styles.adminCard}>
                      <div style={styles.adminCardHeader}>
                        <div>
                          <strong>{campaign.name}</strong>
                          <span style={styles.adminCardType}> - {campaign.type}</span>
                        </div>
                      </div>
                      <p style={styles.adminCardDesc}>{campaign.description}</p>
                      <div style={styles.adminCardInfo}>
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
function CampaignDetail({ campaign, onBack, onDonate, darkMode }) {
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
        <div style={styles.detailImageSection}>
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
                  objectFit: 'contain'
                }}
              />
            </div>
            <div>
              <h1 style={styles.detailName}>{campaign.name}</h1>
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
            </div>
          </div>

          <p style={styles.detailDescription}>{campaign.description}</p>

          <div style={styles.detailWallet}>
            <span style={styles.detailWalletLabel}>Wallet Address</span>
            <code style={styles.detailWalletAddress}>{campaign.walletAddress}</code>
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
            <div style={styles.detailStatItem}>
              <div style={styles.detailStatNumber}>{campaign.supporters}</div>
              <div style={styles.detailStatLabel}>Contributors</div>
            </div>
            <div style={styles.detailStatItem}>
              <div style={styles.detailStatNumber}>{Math.round(progress)}%</div>
              <div style={styles.detailStatLabel}>Funded</div>
            </div>
          </div>

          <button onClick={() => onDonate(campaign)} style={styles.detailDonateBtn} className="donate-btn">
            ☕ Make a Donation
          </button>

          <div style={styles.recentDonations}>
            <h3 style={styles.recentTitle}>Recent Donations</h3>
            {campaign.recentDonations && campaign.recentDonations.length > 0 ? (
              <div style={styles.donationsList}>
                {campaign.recentDonations.slice(0, 5).map((donation, index) => (
                  <div key={index} style={styles.donationItem} className="donation-item">
                    <div style={styles.donationTop}>
                      <span style={styles.donationFrom}>{donation.from}</span>
                      <span style={styles.donationAmount}>{donation.amount} SOL</span>
                    </div>
                    {donation.message && (
                      <p style={styles.donationMessage}>"{donation.message}"</p>
                    )}
                    <span style={styles.donationTime}>{formatTime(donation.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={styles.noDonations}>No donations yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Create Campaign Component
function CreateCampaign({ onClose, onCreate, darkMode }) {
  const { publicKey } = useWallet();
  const [formData, setFormData] = useState({
    name: '',
    type: 'creator',
    image: '',
    description: '',
    goalAmount: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    const newCampaign = {
      id: Date.now(),
      ...formData,
      avatar: formData.type === 'person' ? <i className="bi bi-person-badge"></i> : <i className="bi bi-balloon-heart"></i>,
      walletAddress: publicKey.toString(),
      currentAmount: 0,
      goalAmount: parseFloat(formData.goalAmount),
      supporters: 0,
      timeRemaining: '30 days',
      urgent: false,
      recentDonations: [],
      approved: false, // Needs admin approval
      createdAt: Date.now(),
    };

    // Save to API
    const response = await fetch('/api/create-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: newCampaign })
    });

    if (response.ok) {
      onCreate(newCampaign);
      onClose();
      alert('Campaign submitted for approval! An admin will review it shortly.');
    } else {
      alert('Error creating campaign. Please try again.');
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

          {!publicKey && (
            <div style={{
              ...styles.walletWarning,
              background: darkMode ? '#334155' : '#FEF3C7',
              color: darkMode ? '#fbbf24' : '#92400E'
            }}>
              ⚠️ Connect your wallet to create a campaign
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
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const quickAmounts = [0.1, 0.5, 1, 2, 5];

  const handleDonate = async () => {
    if (!publicKey) {
      setStatus('❌ Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setStatus('❌ Enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      setStatus('⏳ Processing transaction...');

      const recipientPubkey = new PublicKey(campaign.walletAddress);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPubkey,
          lamports: parseFloat(amount) * LAMPORTS_PER_SOL,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      setStatus(`✅ Donation sent! Thank you for your support 🎉`);

      // Note: Campaign stats will be updated automatically by blockchain sync (every 30 seconds)
      // Or you can manually trigger sync if you want instant update
      
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error('Error:', error);
      setStatus(`❌ Error: ${error.message}`);
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
                objectFit: 'contain'
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
            {quickAmounts.map(amt => (
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
              ⚠️ Connect your wallet to continue
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
            {loading ? 'Sending...' : 'Send Donation'} <i class="bi bi-balloon-heart"></i>
          </button>

          {status && (
            <div style={styles.status}>{status}</div>
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
      ...(darkMode ? styles.cardDark : {})
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
              objectFit: 'contain'
            }}
          />
        </div>
        <div style={styles.cardInfo}>
          <div style={{
            ...styles.cardName,
            color: darkMode ? '#f1f5f9' : '#1A1A1A'
          }}>{campaign.name}</div>
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
          Donate ☕
        </button>
      </div>
    </div>
  );
}

// Main App Component
function CoffeeCampaignsApp() {
  const { publicKey } = useWallet();
  const [campaigns, setCampaigns] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDonate, setShowDonate] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [view, setView] = useState('grid');
  const [darkMode, setDarkMode] = useState(false);

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
          darkMode={darkMode}
        />
        {showDonate && (
          <DonationModal 
            campaign={showDonate} 
            onClose={() => setShowDonate(null)}
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
                <span>⚡</span> Powered by Solana
              </div>
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
                    
                    <button className="send-btn" style={styles.sendBtn}>Send Donation <i class="bi bi-balloon-heart"></i></button>
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
        />
      )}
    </div>
  );
}

// App with Providers
export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

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

// Styles (continuing in next part due to length...)
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
    marginBottom: '2rem',
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
    objectFit: 'contain',
    marginBottom: '1rem',
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
  
  coffeeCup: {
    position: 'absolute',
    bottom: '50px',
    right: '-100px',
    width: '180px',
    height: '180px',
    zIndex: 1,
  },
  steam: {
    position: 'absolute',
    top: '-30px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
  },
  steamSpan: {
    display: 'block',
    width: '3px',
    height: '30px',
    background: 'linear-gradient(to top, transparent, rgba(124, 58, 237, 0.3))',
    borderRadius: '50%',
    opacity: 0,
  },
  cupBody: {
    width: '140px',
    height: '160px',
    background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F1ED 100%)',
    borderRadius: '0 0 70px 70px',
    position: 'relative',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
  },
  cupHandle: {
    position: 'absolute',
    right: '-35px',
    top: '40px',
    width: '50px',
    height: '70px',
    border: '15px solid #FFFFFF',
    borderLeft: 'none',
    borderRadius: '0 50px 50px 0',
    boxShadow: 'inset -3px 0 8px rgba(0, 0, 0, 0.1), 0 5px 15px rgba(0, 0, 0, 0.1)',
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
  timeRemaining: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#FEF3C7',
    borderRadius: '10px',
    marginBottom: '1rem',
  },
  timeUrgent: {
    background: '#FEE2E2',
  },
  timeIcon: {
    fontSize: '1.25rem',
  },
  timeText: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#1A1A1A',
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
  supportersAvatars: {
    display: 'flex',
  },
  miniAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    border: '2px solid white',
    marginLeft: '-8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
  },
  supportersCount: {
    fontSize: '0.875rem',
    color: '#666',
    marginLeft: '0.25rem',
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
    paddingTop: '100%',
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
    zIndex: 1000,
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
  
  // Dark Mode Toggle Button
  darkModeBtn: {
    padding: '1rem',
    background: 'white',
    color: '#1A1A1A',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    fontSize: '1.5rem',
    cursor: 'pointer',
    transition: 'all 0.3s',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkModeBtnActive: {
    background: '#1f2937',
    borderColor: '#374151',
  },
  
  // Dark Mode Styles
  appDark: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    color: '#f1f5f9',
  },
  cardDark: {
    background: '#1e293b',
    borderColor: '#334155',
    color: '#f1f5f9',
  },
};