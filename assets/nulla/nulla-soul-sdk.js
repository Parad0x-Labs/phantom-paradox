/**
 * NullaSoul SDK - On-chain persistence for the Glitch Guardian
 * 
 * Layers:
 * - Layer 0 (Echo): Local IndexedDB
 * - Layer 1 (Chronos): Arweave permanent storage
 * - Layer 2 (Totem): Solana PDA on-chain anchor
 */

const NullaSoul = {
    // Program deployed on Solana Devnet
    PROGRAM_ID: 'HmdfwJXTZiL824zGucbZepVoXQRhovknGhXYMF5DtCLw',
    
    // Arweave gateway
    ARWEAVE_GATEWAY: 'https://arweave.net',
    
    // State
    wallet: null,
    connection: null,
    
    /**
     * Initialize the SDK
     */
    async init() {
        // Check for Phantom wallet
        if (window.solana && window.solana.isPhantom) {
            this.wallet = window.solana;
            console.log('[NullaSoul] Phantom detected');
        } else if (window.solflare) {
            this.wallet = window.solflare;
            console.log('[NullaSoul] Solflare detected');
        }
        
        // Setup Solana connection
        this.connection = new solanaWeb3.Connection(
            'https://api.devnet.solana.com',
            'confirmed'
        );
        
        return this;
    },
    
    /**
     * Connect wallet
     */
    async connectWallet() {
        if (!this.wallet) {
            throw new Error('No wallet found. Install Phantom or Solflare.');
        }
        
        try {
            const resp = await this.wallet.connect();
            console.log('[NullaSoul] Connected:', resp.publicKey.toString());
            return resp.publicKey;
        } catch (err) {
            console.error('[NullaSoul] Connect failed:', err);
            throw err;
        }
    },
    
    /**
     * Derive PDA for user's soul
     */
    async deriveSoulPDA(ownerPubkey) {
        const [pda, bump] = await solanaWeb3.PublicKey.findProgramAddress(
            [
                new TextEncoder().encode('nulla_soul'),
                ownerPubkey.toBytes()
            ],
            new solanaWeb3.PublicKey(this.PROGRAM_ID)
        );
        return { pda, bump };
    },
    
    /**
     * Check if soul exists on-chain
     */
    async soulExists(ownerPubkey) {
        const { pda } = await this.deriveSoulPDA(ownerPubkey);
        const info = await this.connection.getAccountInfo(pda);
        return info !== null;
    },
    
    /**
     * Compress Nulla state for on-chain storage
     * Uses ZSTD-like dictionary approach (simplified for browser)
     */
    compressState(state) {
        const json = JSON.stringify(state);
        // Simple compression: use browser's CompressionStream if available
        // For now, just encode and hope it's small enough
        const encoder = new TextEncoder();
        const data = encoder.encode(json);
        
        // Apply simple delta encoding for common strings
        const dictionary = ['xp', 'stage', 'patterns', 'facts', 'history', 'sentiment'];
        let compressed = json;
        dictionary.forEach((word, i) => {
            compressed = compressed.replace(new RegExp(`"${word}"`, 'g'), `"$${i}"`);
        });
        
        return new TextEncoder().encode(compressed);
    },
    
    /**
     * Decompress state from on-chain
     */
    decompressState(data) {
        const decoder = new TextDecoder();
        let json = decoder.decode(data);
        
        // Reverse dictionary encoding
        const dictionary = ['xp', 'stage', 'patterns', 'facts', 'history', 'sentiment'];
        dictionary.forEach((word, i) => {
            json = json.replace(new RegExp(`"\\$${i}"`, 'g'), `"${word}"`);
        });
        
        return JSON.parse(json);
    },
    
    /**
     * Hash state for integrity verification (SHA-256)
     */
    async hashState(state) {
        const json = JSON.stringify(state);
        const data = new TextEncoder().encode(json);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
    },
    
    /**
     * Upload to Arweave (via bundlr/irys for cheaper uploads)
     * For now, simulate with local storage backup
     */
    async uploadToArweave(state) {
        const json = JSON.stringify(state);
        const hash = await this.hashState(state);
        const hashHex = Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // For devnet testing: store in localStorage with Arweave-like URI
        const arweaveKey = `arweave_nulla_${hashHex.slice(0, 16)}`;
        localStorage.setItem(arweaveKey, json);
        
        // Return fake Arweave URI (real impl would upload to Arweave)
        const fakeUri = `ar://${hashHex.slice(0, 43)}`;
        
        console.log('[NullaSoul] Simulated Arweave upload:', fakeUri);
        return fakeUri;
    },
    
    /**
     * Build initialize_soul instruction
     */
    buildInitializeSoulIx(ownerPubkey, soulPda, coreBlob, coreHash, fullHash, timelineRoot, backupUri) {
        // Instruction discriminator for initialize_soul (first 8 bytes of sha256("global:initialize_soul"))
        const discriminator = new Uint8Array([0x9c, 0x2c, 0x86, 0x83, 0x5c, 0x06, 0x8b, 0x7f]);
        
        // Build instruction data
        const blobLength = new Uint8Array(4);
        new DataView(blobLength.buffer).setUint32(0, coreBlob.length, true);
        
        const uriBytes = new TextEncoder().encode(backupUri);
        const uriLength = new Uint8Array(4);
        new DataView(uriLength.buffer).setUint32(0, uriBytes.length, true);
        
        const data = new Uint8Array([
            ...discriminator,
            ...blobLength, ...coreBlob,
            ...coreHash,
            ...fullHash,
            ...timelineRoot,
            ...uriLength, ...uriBytes
        ]);
        
        return new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: soulPda, isSigner: false, isWritable: true },
                { pubkey: ownerPubkey, isSigner: true, isWritable: true },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(this.PROGRAM_ID),
            data: data
        });
    },
    
    /**
     * Initialize soul on-chain (first time)
     */
    async initializeSoul(nullaState) {
        if (!this.wallet || !this.wallet.publicKey) {
            throw new Error('Wallet not connected');
        }
        
        const ownerPubkey = this.wallet.publicKey;
        const { pda: soulPda } = await this.deriveSoulPDA(ownerPubkey);
        
        // Compress and hash
        const coreBlob = this.compressState(nullaState);
        const coreHash = await this.hashState(nullaState);
        const fullHash = coreHash; // Same for now
        const timelineRoot = new Uint8Array(32); // Empty merkle root
        
        // Upload backup
        const backupUri = await this.uploadToArweave(nullaState);
        
        // Build transaction
        const ix = this.buildInitializeSoulIx(
            ownerPubkey,
            soulPda,
            coreBlob,
            coreHash,
            fullHash,
            timelineRoot,
            backupUri
        );
        
        const tx = new solanaWeb3.Transaction().add(ix);
        tx.feePayer = ownerPubkey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        
        // Sign and send
        const signedTx = await this.wallet.signTransaction(tx);
        const sig = await this.connection.sendRawTransaction(signedTx.serialize());
        await this.connection.confirmTransaction(sig);
        
        console.log('[NullaSoul] Soul initialized! TX:', sig);
        return { signature: sig, pda: soulPda.toString() };
    },
    
    /**
     * Sync soul to chain (update existing)
     */
    async syncSoul(nullaState) {
        if (!this.wallet || !this.wallet.publicKey) {
            throw new Error('Wallet not connected');
        }
        
        const ownerPubkey = this.wallet.publicKey;
        const { pda: soulPda } = await this.deriveSoulPDA(ownerPubkey);
        
        // Check if soul exists
        const exists = await this.soulExists(ownerPubkey);
        if (!exists) {
            return this.initializeSoul(nullaState);
        }
        
        // Compress and hash
        const coreBlob = this.compressState(nullaState);
        const coreHash = await this.hashState(nullaState);
        const fullHash = coreHash;
        const timelineRoot = new Uint8Array(32);
        const backupUri = await this.uploadToArweave(nullaState);
        
        // Build sync instruction (similar to initialize)
        const discriminator = new Uint8Array([0x2c, 0x9e, 0x1c, 0x8f, 0x5a, 0x72, 0xd4, 0x11]); // sync_soul
        
        const blobLength = new Uint8Array(4);
        new DataView(blobLength.buffer).setUint32(0, coreBlob.length, true);
        
        const uriBytes = new TextEncoder().encode(backupUri);
        const uriLength = new Uint8Array(4);
        new DataView(uriLength.buffer).setUint32(0, uriBytes.length, true);
        
        const data = new Uint8Array([
            ...discriminator,
            ...blobLength, ...coreBlob,
            ...coreHash,
            ...fullHash,
            ...timelineRoot,
            ...uriLength, ...uriBytes
        ]);
        
        const ix = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: soulPda, isSigner: false, isWritable: true },
                { pubkey: ownerPubkey, isSigner: true, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(this.PROGRAM_ID),
            data: data
        });
        
        const tx = new solanaWeb3.Transaction().add(ix);
        tx.feePayer = ownerPubkey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        
        const signedTx = await this.wallet.signTransaction(tx);
        const sig = await this.connection.sendRawTransaction(signedTx.serialize());
        await this.connection.confirmTransaction(sig);
        
        console.log('[NullaSoul] Soul synced! TX:', sig);
        return { signature: sig, pda: soulPda.toString() };
    },
    
    /**
     * Read soul from chain
     */
    async readSoul(ownerPubkey) {
        if (typeof ownerPubkey === 'string') {
            ownerPubkey = new solanaWeb3.PublicKey(ownerPubkey);
        }
        
        const { pda } = await this.deriveSoulPDA(ownerPubkey);
        const info = await this.connection.getAccountInfo(pda);
        
        if (!info) {
            return null;
        }
        
        // Parse account data (skip 8-byte discriminator)
        const data = info.data;
        
        // Version (1 byte)
        const version = data[8];
        
        // Owner (32 bytes)
        const owner = new solanaWeb3.PublicKey(data.slice(9, 41));
        
        // Bump (1 byte)
        const bump = data[41];
        
        // Core blob length (4 bytes)
        const blobLen = new DataView(data.buffer).getUint32(42, true);
        
        // Core blob
        const coreBlob = data.slice(46, 46 + blobLen);
        
        // Try to decompress
        let coreState = null;
        try {
            coreState = this.decompressState(coreBlob);
        } catch (e) {
            console.warn('[NullaSoul] Failed to decompress core state');
        }
        
        return {
            version,
            owner: owner.toString(),
            bump,
            coreState,
            raw: data
        };
    },
    
    /**
     * Get verification link for Solscan
     */
    getSolscanLink(signature) {
        return `https://solscan.io/tx/${signature}?cluster=devnet`;
    }
};

// Export for use
window.NullaSoul = NullaSoul;
console.log('[NullaSoul SDK] Loaded - Program:', NullaSoul.PROGRAM_ID);

