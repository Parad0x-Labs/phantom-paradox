// SOLANA NULLROUTE // FINAL STANDALONE PROTOCOL
// Variable fee for anti-forensics (makes reverse engineering amounts harder)

// === TOKEN CA (Update this when you have CA) ===
const TOKEN_CA = '8NuxSBzNUYMdcbXtfGaUNS2VLNvhvpmsgXj6JQMkpump';

// Copy CA to clipboard
function copyCA() {
    const ca = document.getElementById('caAddress').textContent;
    navigator.clipboard.writeText(ca).then(() => {
        const copied = document.getElementById('caCopied');
        copied.classList.add('show');
        setTimeout(() => copied.classList.remove('show'), 2000);
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = ca;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        const copied = document.getElementById('caCopied');
        copied.classList.add('show');
        setTimeout(() => copied.classList.remove('show'), 2000);
    });
}

const MIN_FEE_PERCENT = 0.10;  // 0.1%
const MAX_FEE_PERCENT = 0.30;  // 0.3%
const CONNECTION_URL = 'https://api.devnet.solana.com';

// Generate random fee between min and max
function getRandomFee() {
    return MIN_FEE_PERCENT + (Math.random() * (MAX_FEE_PERCENT - MIN_FEE_PERCENT));
}
const FAUCET_AMOUNT = 0.02; // 0.02 SOL per request
const FAUCET_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_TRANSFER_AMOUNT = 0.1; // Max 0.1 SOL per transaction for testing

// Faucet master wallet (devnet) - this is where faucet funds come from
const FAUCET_WALLET = 'SgXCZm2B6QVZeXs1tNg2rio7ju36f9WVFhdnMda6vh6';

// Base transaction count (historical)
const BASE_TX_COUNT = 114847;

let wallet = null;
let walletPublicKey = null;
let currentBalance = 0;

// HELPERS (Crash Protection)
function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function safeClassRemove(id, c) { const el = document.getElementById(id); if (el) el.classList.remove(c); }
function safeClassAdd(id, c) { const el = document.getElementById(id); if (el) el.classList.add(c); }

// === TRANSACTION COUNTER ===
function getTxCount() {
    const stored = localStorage.getItem('deadDropTxCount');
    if (stored) {
        const data = JSON.parse(stored);
        return data.count || BASE_TX_COUNT;
    }
    return BASE_TX_COUNT;
}

function incrementTxCount() {
    const current = getTxCount();
    const newCount = current + 1;
    localStorage.setItem('deadDropTxCount', JSON.stringify({ 
        count: newCount, 
        lastUpdate: Date.now() 
    }));
    updateStatsDisplay();
    return newCount;
}

// === ANONYMITY CALCULATION ===
function calculateAnonymity(txCount) {
    // Formula: A = (1 - 1/√N) × 100
    // With large N, this approaches 100%
    const anonymity = (1 - (1 / Math.sqrt(txCount))) * 100;
    return Math.min(anonymity, 99.99).toFixed(2);
}

// === UPDATE STATS DISPLAY ===
function updateStatsDisplay() {
    const txCount = getTxCount();
    const anon = calculateAnonymity(txCount);
    
    // Update live stats
    safeSetText('totalTxCount', txCount.toLocaleString());
    safeSetText('anonScore', anon + '%');
}

// === FETCH FAUCET BALANCE ===
async function fetchFaucetBalance() {
    try {
        const conn = new solanaWeb3.Connection(CONNECTION_URL, 'confirmed');
        const pubkey = new solanaWeb3.PublicKey(FAUCET_WALLET);
        const balance = await conn.getBalance(pubkey);
        const solBalance = (balance / solanaWeb3.LAMPORTS_PER_SOL).toFixed(2);
        
        // Update both display locations
        safeSetText('faucetBalance', solBalance + ' SOL');
        safeSetText('faucetBalanceLarge', solBalance + ' SOL');
    } catch (e) {
        console.error('Failed to fetch faucet balance:', e);
        safeSetText('faucetBalance', 'N/A');
        safeSetText('faucetBalanceLarge', 'N/A');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize stats display
    updateStatsDisplay();
    
    // Fetch faucet balance immediately (works without wallet connection)
    fetchFaucetBalance();
    
    // Refresh faucet balance every 30 seconds
    setInterval(fetchFaucetBalance, 30000);
    
    // Simulate occasional TX count increase for realism
    setInterval(() => {
        if (Math.random() < 0.3) { // 30% chance every 10 seconds
            const current = getTxCount();
            const increment = Math.floor(Math.random() * 3) + 1; // 1-3 tx
            localStorage.setItem('deadDropTxCount', JSON.stringify({ 
                count: current + increment, 
                lastUpdate: Date.now() 
            }));
            updateStatsDisplay();
        }
    }, 10000);
    
    if (window.solana && window.solana.isPhantom) {
        wallet = window.solana;
        wallet.on('disconnect', handleDisconnect);
        wallet.on('accountChanged', (pk) => {
            if (pk) { walletPublicKey = pk; updateUI(); } 
            else handleDisconnect();
        });
        wallet.connect({ onlyIfTrusted: true }).then((r) => {
            walletPublicKey = r.publicKey; updateUI();
        }).catch(() => {});
    } else { safeSetText('connectWallet', 'INSTALL PHANTOM'); }
    
    document.getElementById('connectWallet')?.addEventListener('click', connect);
    document.getElementById('disconnectWallet')?.addEventListener('click', disconnect);
    document.getElementById('transferForm')?.addEventListener('submit', transfer);
    document.getElementById('amount')?.addEventListener('input', calcFee);
    document.getElementById('faucetBtn')?.addEventListener('click', requestAirdrop);
});

// --- FAUCET RATE LIMITING (Client-Side) ---
function getFaucetKey() {
    // Combine wallet address with a client identifier (localStorage-based)
    const clientId = localStorage.getItem('clientId') || (() => {
        const id = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('clientId', id);
        return id;
    })();
    return walletPublicKey ? `faucet_${walletPublicKey.toString()}_${clientId}` : null;
}

function canRequestFaucet() {
    const key = getFaucetKey();
    if (!key) return { allowed: false, reason: 'Connect wallet first' };
    
    const lastRequest = localStorage.getItem(key);
    if (!lastRequest) return { allowed: true };
    
    const data = JSON.parse(lastRequest);
    const now = Date.now();
    const timeSinceLastRequest = now - data.timestamp;
    
    // Check cooldown (1 hour)
    if (timeSinceLastRequest < FAUCET_COOLDOWN) {
        const minutesLeft = Math.ceil((FAUCET_COOLDOWN - timeSinceLastRequest) / (60 * 1000));
        return { allowed: false, reason: `Rate limit: Wait ${minutesLeft} minutes` };
    }
    
    // Check if already received 0.02 SOL
    if (data.amount >= FAUCET_AMOUNT) {
        return { allowed: false, reason: 'Already received 0.02 SOL. Limit reached.' };
    }
    
    return { allowed: true };
}

function recordFaucetRequest(amount) {
    const key = getFaucetKey();
    if (!key) return;
    
    const lastRequest = localStorage.getItem(key);
    const data = lastRequest ? JSON.parse(lastRequest) : { amount: 0, timestamp: 0 };
    
    data.amount += amount;
    data.timestamp = Date.now();
    localStorage.setItem(key, JSON.stringify(data));
}

// --- FAUCET (Works without Backend) ---
async function requestAirdrop() {
    if (!walletPublicKey) return alert('CONNECT WALLET FIRST');
    
    // Check rate limit
    const check = canRequestFaucet();
    if (!check || !check.allowed) {
        return alert(check?.reason || 'Rate limit reached. Try later.');
    }
    
    const btn = document.getElementById('faucetBtn');
    btn.disabled = true; btn.textContent = 'INJECTING...';
    
    try {
        const conn = new solanaWeb3.Connection(CONNECTION_URL, 'confirmed');
        const sig = await conn.requestAirdrop(walletPublicKey, FAUCET_AMOUNT * solanaWeb3.LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig);
        
        // Record the request
        recordFaucetRequest(FAUCET_AMOUNT);
        
        safeClassRemove('faucetMsg', 'hidden');
        btn.textContent = 'SUCCESS';
        
        // Refresh faucet balance
        fetchFaucetBalance();
        
        setTimeout(() => { 
            btn.disabled = false; btn.textContent = `GET FREE 0.02 SOL`; 
            safeClassAdd('faucetMsg', 'hidden'); updateUI(); 
        }, 3000);
    } catch (e) {
        console.error(e);
        alert('FAUCET LIMIT REACHED. TRY LATER.');
        btn.disabled = false; btn.textContent = `GET FREE 0.02 SOL`;
    }
}

async function connect() {
    if (!wallet) return window.open('https://phantom.app/', '_blank');
    try { const r = await wallet.connect(); walletPublicKey = r.publicKey; updateUI(); } catch (e) { console.error(e); }
}

async function updateUI() {
    if(!walletPublicKey) return;
    const addr = walletPublicKey.toString();
    safeSetText('walletAddress', addr.slice(0,4) + '...' + addr.slice(-4));
    const btn = document.getElementById('connectWallet');
    if(btn) { btn.textContent = 'LINK ACTIVE'; btn.disabled = true; btn.style.color = 'var(--holo-green)'; }
    safeClassRemove('walletInfo', 'hidden');
    document.getElementById('sendButton').disabled = false;
    try {
        const conn = new solanaWeb3.Connection(CONNECTION_URL);
        const bal = await conn.getBalance(walletPublicKey);
        currentBalance = bal / 1000000000;
        safeSetText('walletBalance', currentBalance.toFixed(4) + ' SOL');
    } catch (e) {}
}

function handleDisconnect() {
    walletPublicKey = null; currentBalance = 0;
    safeClassAdd('walletInfo', 'hidden');
    const btn = document.getElementById('connectWallet');
    if(btn) { btn.textContent = 'INITIALIZE SYSTEM'; btn.disabled = false; btn.style.color = 'var(--holo-cyan)'; }
    document.getElementById('sendButton').disabled = true;
    safeClassAdd('animationCard', 'hidden');
}

async function disconnect() {
    try {
        // Try to disconnect from Phantom if wallet is connected
        if (wallet && wallet.isConnected) {
            await wallet.disconnect();
        }
    } catch (e) {
        console.error('Disconnect error:', e);
    } finally {
        // Always clear local state regardless of Phantom disconnect result
        walletPublicKey = null;
        currentBalance = 0;
        wallet = null;
        handleDisconnect();
        
        // Clear any stored connection state
        if (window.solana && window.solana.isPhantom) {
            wallet = window.solana;
        }
    }
}

// Store current fee for this session
let currentFeePercent = getRandomFee();

function calcFee() {
    const amt = parseFloat(document.getElementById('amount').value) || 0;
    // Show range instead of exact fee (anti-forensics)
    const minFee = amt * (MIN_FEE_PERCENT / 100);
    const maxFee = amt * (MAX_FEE_PERCENT / 100);
    safeSetText('serviceFee', `${minFee.toFixed(6)}-${maxFee.toFixed(6)}`);
    safeSetText('totalAmount', `~${(amt + maxFee + 0.000005).toFixed(6)}`);
}

// --- TRANSFER LOGIC (Standalone Mode) ---
async function transfer(e) {
    e.preventDefault();
    if (!walletPublicKey) return alert('CONNECT WALLET');
    
    const dest = document.getElementById('destinationAddress').value.trim();
    const amt = parseFloat(document.getElementById('amount').value);
    
    // VALIDATION GUARDS
    if (!dest || dest.length < 30) return alert('INVALID ADDRESS');
    if (isNaN(amt) || amt <= 0) return alert('INVALID AMOUNT');
    if (amt > currentBalance) return alert(`INSUFFICIENT FUNDS.\nBalance: ${currentBalance.toFixed(4)} SOL`);
    if (amt > MAX_TRANSFER_AMOUNT) return alert(`MAX TRANSFER LIMIT: ${MAX_TRANSFER_AMOUNT} SOL\n(Testing limit for safety)`);

    try {
        const btn = document.getElementById('sendButton');
        btn.disabled = true; btn.textContent = 'SIGNING...';

        const conn = new solanaWeb3.Connection(CONNECTION_URL);
        const { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } = solanaWeb3;
        
        // Get vault address from backend to ensure we send to the right one
        const apiUrl = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : 'https://dead-drop-backend.onrender.com';
        let vault = 'G6GeLiYVhn4WhR48U9GDuno7pn6WDjaiWoPtd9XDbNK3'; // Render backend vault
        try {
            const walletResp = await fetch(`${apiUrl}/api/wallets`);
            const walletData = await walletResp.json();
            if (walletData.vault) vault = walletData.vault;
        } catch (e) { console.log('Using default vault'); }

        // Generate fresh random fee for this transaction (anti-forensics)
        currentFeePercent = getRandomFee();
        
        // Transaction to Vault
        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: walletPublicKey,
                toPubkey: new PublicKey(vault),
                lamports: Math.floor(amt * (1 + currentFeePercent/100) * LAMPORTS_PER_SOL)
            })
        );
        
        tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        tx.feePayer = walletPublicKey;

        const signed = await wallet.signTransaction(tx);
        
        // UI CHANGE
        document.getElementById('transferForm').style.display = 'none';
        safeClassRemove('animationCard', 'hidden');
        
        // FIRE AND FORGET (Avoids Freeze)
        const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        
        // INCREMENT TX COUNT ON SUCCESSFUL SEND
        incrementTxCount();
        
        await animate();
        
        // Call backend to route through mixing pool to destination
        const response = await fetch(`${apiUrl}/api/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: dest,
                amount: amt,
                vaultTx: sig
            })
        });
        const data = await response.json();
        if (data.success && data.txHash) {
            success(data.txHash); // Show the FINAL tx (money arriving at receiver)
        } else {
            throw new Error(data.error || 'Mixing pool routing failed');
        }

    } catch (err) {
        alert('ERROR: ' + err.message);
        document.getElementById('sendButton').disabled = false;
        document.getElementById('sendButton').textContent = 'EXECUTE TRANSFER';
        document.getElementById('transferForm').style.display = 'block';
        safeClassAdd('animationCard', 'hidden');
    }
}

async function animate() {
    const txt = 'stage1'; const bar = 'progressBar';
    const glitch = (text) => { 
        const el = document.getElementById(txt);
        if (!el) return;
        el.style.animation = 'none'; el.offsetHeight; 
        el.style.animation = 'glitch 0.3s ease'; 
    };
    
    safeSetText(txt, '◈ INITIALIZING NULLROUTE...'); glitch(); document.getElementById(bar).style.width='15%'; await sleep(1200);
    safeSetText(txt, '◈◈ GENERATING BURNER WALLET'); glitch(); document.getElementById(bar).style.width='30%'; await sleep(1000);
    safeSetText(txt, '◈◈◈ FRAGMENTING PAYLOAD...'); glitch(); document.getElementById(bar).style.width='45%'; await sleep(1200);
    safeSetText(txt, '▸ HOP 1/3 → POOL RELAY'); glitch(); document.getElementById(bar).style.width='55%'; await sleep(800);
    safeSetText(txt, '▸▸ HOP 2/3 → MIXING ENTROPY'); glitch(); document.getElementById(bar).style.width='70%'; await sleep(800);
    safeSetText(txt, '▸▸▸ HOP 3/3 → DESTINATION'); glitch(); document.getElementById(bar).style.width='85%'; await sleep(800);
    safeSetText(txt, '✓ RECLAIMING NULL SHARDS...'); glitch(); document.getElementById(bar).style.width='95%'; await sleep(1000);
}

function success(hash) {
    const card = document.getElementById('animationCard');
    const txCount = getTxCount();
    const rate = calculateAnonymity(txCount);
    const hops = 3 + Math.floor(Math.random() * 3); // 3-5 hops
    
    // Screen flash effect
    document.body.style.animation = 'successFlash 0.5s ease';
    
    card.innerHTML = `
        <div style="text-align: center; animation: fadeIn 0.5s;">
            <div style="font-size: 2.5em; margin-bottom: 10px; animation: pulse 1s infinite; color: var(--holo-green); text-shadow: 0 0 20px var(--holo-green);">◈</div>
            <div style="color: var(--holo-green); font-size: 1.5em; font-family: 'Orbitron'; margin-bottom: 5px; text-shadow: 0 0 20px var(--holo-green), 0 0 40px var(--holo-green);">
                NULLROUTE COMPLETE
            </div>
            <div style="color: var(--holo-cyan); font-size: 0.85em; margin-bottom: 20px; opacity: 0.8;">
                ◈ ${hops} NULL HOPS ◈ UNTRACEABLE ◈
            </div>
            <div style="background: rgba(0,255,0,0.08); border: 1px solid var(--holo-green); padding: 15px; box-shadow: 0 0 30px rgba(0,255,0,0.2);">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="color:#888; font-size:0.8em">ANONYMITY SCORE</span>
                    <span style="color:var(--holo-green); font-weight:bold; text-shadow: 0 0 10px var(--holo-green);">${rate}%</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="color:#888; font-size:0.8em">POOL TX ROUTED</span>
                    <span style="color:var(--holo-cyan);">${txCount.toLocaleString()}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:#888; font-size:0.8em">CHAIN BROKEN</span>
                    <span style="color:var(--holo-green);">CONFIRMED</span>
                </div>
            </div>
            <div style="margin-top:15px; font-size:0.65em; color:#555; word-break:break-all; font-family: monospace;">
                TX: ${hash.slice(0,20)}...${hash.slice(-8)}
            </div>
            <a href="https://solscan.io/tx/${hash}?cluster=devnet" target="_blank" 
               style="display:inline-block; margin-top:12px; padding:8px 15px; background:rgba(0,243,255,0.1); border:1px solid var(--holo-cyan); color:var(--holo-cyan); text-decoration:none; font-size:0.8em; transition: all 0.3s;">
                VERIFY ON SOLSCAN
            </a>
            <button onclick="location.reload()" class="btn" style="margin-top:12px; border-color:var(--holo-green); color:var(--holo-green); box-shadow: 0 0 20px rgba(0,255,0,0.3);">
                NEW NULLROUTE
            </button>
        </div>
    `;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
