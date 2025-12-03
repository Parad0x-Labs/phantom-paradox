/**
 * PARADOX AGENT MESSAGE SCHEMA
 * 
 * All messages between agents, manager, and dispute system
 * follow this schema for consistency and verifiability.
 * 
 * Messages are:
 * 1. Signed by sender wallet
 * 2. Timestamped
 * 3. Hashed for integrity
 * 4. Optionally stored on Arweave
 */

// ============== CORE TYPES ==============

export type MessageType = 
    | 'job_request'      // Brains → Manager
    | 'job_assignment'   // Manager → Muscle
    | 'job_accept'       // Muscle → Manager
    | 'job_reject'       // Muscle → Manager
    | 'job_progress'     // Muscle → Manager (heartbeat)
    | 'job_complete'     // Muscle → Manager
    | 'job_result'       // Muscle → Brains
    | 'job_approve'      // Brains → Manager
    | 'job_dispute'      // Either → Dispute System
    | 'dispute_evidence' // Either → Dispute System
    | 'jury_invite'      // Dispute System → Jury
    | 'jury_accept'      // Jury → Dispute System
    | 'jury_vote'        // Jury → Dispute System
    | 'dispute_verdict'  // Dispute System → All
    | 'payment_stream'   // Manager → Muscle
    | 'payment_complete' // Manager → Both
    | 'heartbeat'        // Muscle → Manager
    | 'slash_warning'    // PDOX Watcher → Muscle
    | 'slash_execute';   // PDOX Watcher → Contract

export type JobType = 'compute' | 'relay' | 'verify' | 'storage' | 'jury';

export type JobStatus = 
    | 'pending'
    | 'assigned'
    | 'in_progress'
    | 'completed'
    | 'approved'
    | 'disputed'
    | 'cancelled';

export type DisputeStatus = 
    | 'open'
    | 'jury_selection'
    | 'voting'
    | 'resolved'
    | 'timeout';

export type VerdictType = 'brains_win' | 'muscle_win' | 'split' | 'timeout';

// ============== BASE MESSAGE ==============

export interface BaseMessage {
    // Unique message ID (UUID v4)
    id: string;
    
    // Message type
    type: MessageType;
    
    // Sender wallet address (Solana pubkey)
    sender: string;
    
    // Recipient(s) - can be specific address or 'manager' | 'dispute_system'
    recipient: string | string[];
    
    // ISO timestamp
    timestamp: string;
    
    // Message version for future compatibility
    version: '1.0';
    
    // Signature of message hash by sender
    signature: string;
    
    // SHA256 hash of payload
    payloadHash: string;
    
    // Optional: Arweave TX ID if stored permanently
    arweaveTxId?: string;
    
    // Optional: Solana TX ID for on-chain anchor
    solanaTxId?: string;
}

// ============== JOB MESSAGES ==============

export interface JobRequestMessage extends BaseMessage {
    type: 'job_request';
    payload: {
        jobType: JobType;
        description: string;
        requirements: {
            minBandwidth?: number;  // Mbps
            minCpu?: number;        // percentage
            minRam?: number;        // MB
            maxLatency?: number;    // ms
            location?: string[];    // country codes
        };
        budget: {
            maxAmount: number;      // in lamports
            currency: 'SOL' | 'USDC';
            escrowTxId: string;     // Solana TX of escrow deposit
        };
        duration: {
            estimated: number;      // minutes
            maxDuration: number;    // minutes
        };
        autoApprove: boolean;       // true = auto-release payment on completion
    };
}

export interface JobAssignmentMessage extends BaseMessage {
    type: 'job_assignment';
    payload: {
        jobId: string;
        brainsAddress: string;
        muscleAddress: string;
        jobType: JobType;
        description: string;
        payment: {
            amount: number;
            currency: 'SOL' | 'USDC';
            escrowAddress: string;
        };
        deadline: string;           // ISO timestamp
        autoApprove: boolean;
    };
}

export interface JobAcceptMessage extends BaseMessage {
    type: 'job_accept';
    payload: {
        jobId: string;
        muscleAddress: string;
        estimatedCompletion: string; // ISO timestamp
    };
}

export interface JobRejectMessage extends BaseMessage {
    type: 'job_reject';
    payload: {
        jobId: string;
        muscleAddress: string;
        reason: string;
    };
}

export interface JobProgressMessage extends BaseMessage {
    type: 'job_progress';
    payload: {
        jobId: string;
        muscleAddress: string;
        progress: number;           // 0-100
        metrics?: {
            bandwidth?: number;
            cpuUsage?: number;
            dataTransferred?: number;
        };
    };
}

export interface JobCompleteMessage extends BaseMessage {
    type: 'job_complete';
    payload: {
        jobId: string;
        muscleAddress: string;
        result: {
            success: boolean;
            output?: string;        // result data or hash
            proofHash?: string;     // merkle proof of work
            metrics: {
                duration: number;   // actual minutes
                dataTransferred?: number;
                computeCycles?: number;
            };
        };
    };
}

export interface JobApproveMessage extends BaseMessage {
    type: 'job_approve';
    payload: {
        jobId: string;
        brainsAddress: string;
        approved: boolean;
        rating?: number;            // 1-5 stars
        feedback?: string;
        counterOffer?: {
            amount: number;         // partial payment offer
            reason: string;
        };
    };
}

// ============== DISPUTE MESSAGES ==============

export interface DisputeOpenMessage extends BaseMessage {
    type: 'job_dispute';
    payload: {
        jobId: string;
        disputeId: string;
        opener: 'brains' | 'muscle';
        openerAddress: string;
        reason: string;
        category: 'non_delivery' | 'poor_quality' | 'non_payment' | 'fraud' | 'other';
        requestedOutcome: VerdictType;
        evidenceHashes: string[];   // hashes of evidence to be submitted
    };
}

export interface DisputeEvidenceMessage extends BaseMessage {
    type: 'dispute_evidence';
    payload: {
        disputeId: string;
        submitter: string;
        evidenceType: 'text' | 'image' | 'log' | 'transaction' | 'proof';
        title: string;
        description: string;
        dataHash: string;           // SHA256 of actual data
        arweaveUrl?: string;        // permanent storage link
        // Encrypted data (only jury can decrypt)
        encryptedData?: string;
    };
}

export interface JuryInviteMessage extends BaseMessage {
    type: 'jury_invite';
    payload: {
        disputeId: string;
        jurorAddress: string;
        expiresAt: string;          // 5 min to accept
        reward: number;             // potential reward in lamports
        casePreview: {
            category: string;
            brainsAddress: string;
            muscleAddress: string;
            amount: number;
        };
    };
}

export interface JuryAcceptMessage extends BaseMessage {
    type: 'jury_accept';
    payload: {
        disputeId: string;
        jurorAddress: string;
        accepted: boolean;
    };
}

export interface JuryVoteMessage extends BaseMessage {
    type: 'jury_vote';
    payload: {
        disputeId: string;
        jurorAddress: string;
        vote: VerdictType;
        confidence: number;         // 1-10
        reasoning?: string;         // optional explanation
        // Encrypted until reveal phase
        voteHash: string;           // hash(vote + secret)
        revealSecret?: string;      // revealed after voting closes
    };
}

export interface DisputeVerdictMessage extends BaseMessage {
    type: 'dispute_verdict';
    payload: {
        disputeId: string;
        jobId: string;
        verdict: VerdictType;
        voteBreakdown: {
            brainsWin: number;
            muscleWin: number;
            split: number;
            abstain: number;
        };
        payment: {
            brainsReceives: number;
            muscleReceives: number;
            protocolFee: number;
            juryReward: number;
        };
        winningJurors: string[];
        losingJurors: string[];
        finalizedTxId: string;      // Solana TX of payment release
    };
}

// ============== PAYMENT MESSAGES ==============

export interface PaymentStreamMessage extends BaseMessage {
    type: 'payment_stream';
    payload: {
        jobId: string;
        muscleAddress: string;
        amount: number;             // lamports
        currency: 'SOL' | 'USDC';
        txId: string;
        totalPaid: number;          // cumulative
        remaining: number;          // in escrow
    };
}

export interface PaymentCompleteMessage extends BaseMessage {
    type: 'payment_complete';
    payload: {
        jobId: string;
        brainsAddress: string;
        muscleAddress: string;
        finalAmount: number;
        currency: 'SOL' | 'USDC';
        txId: string;
        breakdown: {
            muscleReceived: number;
            protocolFee: number;
            brainsRefund?: number;
        };
    };
}

// ============== SYSTEM MESSAGES ==============

export interface HeartbeatMessage extends BaseMessage {
    type: 'heartbeat';
    payload: {
        agentAddress: string;
        status: 'online' | 'busy' | 'idle';
        capabilities: JobType[];
        metrics: {
            cpuAvailable: number;
            ramAvailable: number;
            bandwidthAvailable: number;
            activeJobs: number;
        };
        reputation: number;         // 0-100 score
    };
}

export interface SlashWarningMessage extends BaseMessage {
    type: 'slash_warning';
    payload: {
        agentAddress: string;
        currentScore: number;
        threshold: number;          // usually 80
        violations: {
            type: string;
            count: number;
            lastOccurrence: string;
        }[];
        gracePeriodEnds: string;    // ISO timestamp
    };
}

export interface SlashExecuteMessage extends BaseMessage {
    type: 'slash_execute';
    payload: {
        agentAddress: string;
        slashAmount: number;        // PDOX slashed
        reason: string;
        violations: string[];
        txId: string;               // Solana TX of slash
        newStake: number;           // remaining PDOX stake
        newScore: number;
    };
}

// ============== UTILITIES ==============

export type AnyMessage = 
    | JobRequestMessage
    | JobAssignmentMessage
    | JobAcceptMessage
    | JobRejectMessage
    | JobProgressMessage
    | JobCompleteMessage
    | JobApproveMessage
    | DisputeOpenMessage
    | DisputeEvidenceMessage
    | JuryInviteMessage
    | JuryAcceptMessage
    | JuryVoteMessage
    | DisputeVerdictMessage
    | PaymentStreamMessage
    | PaymentCompleteMessage
    | HeartbeatMessage
    | SlashWarningMessage
    | SlashExecuteMessage;

/**
 * Create a message hash for signing
 */
export function createMessageHash(msg: Omit<BaseMessage, 'signature' | 'payloadHash'>): string {
    const content = JSON.stringify({
        id: msg.id,
        type: msg.type,
        sender: msg.sender,
        recipient: msg.recipient,
        timestamp: msg.timestamp,
        version: msg.version
    });
    
    // In real impl, use crypto.subtle.digest('SHA-256', ...)
    return `hash_${content.length}_${Date.now()}`;
}

/**
 * Validate message structure
 */
export function validateMessage(msg: AnyMessage): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!msg.id) errors.push('Missing message ID');
    if (!msg.type) errors.push('Missing message type');
    if (!msg.sender) errors.push('Missing sender');
    if (!msg.recipient) errors.push('Missing recipient');
    if (!msg.timestamp) errors.push('Missing timestamp');
    if (!msg.signature) errors.push('Missing signature');
    
    // Validate timestamp is recent (within 5 minutes)
    const msgTime = new Date(msg.timestamp).getTime();
    const now = Date.now();
    if (Math.abs(now - msgTime) > 5 * 60 * 1000) {
        errors.push('Timestamp too old or in future');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

