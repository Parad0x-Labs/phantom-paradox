/**
 * DISPUTE MANAGER
 * 
 * Handles dispute resolution:
 * - Jury selection
 * - Evidence collection
 * - Voting
 * - Verdict execution
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { AgentManager, Agent } from './AgentManager';

export type DisputeStatus = 'open' | 'jury_selection' | 'voting' | 'resolved' | 'timeout';
export type VerdictType = 'brains_win' | 'muscle_win' | 'split' | 'timeout';

export interface Dispute {
    id: string;
    jobId: string;
    status: DisputeStatus;
    
    // Parties
    brainsAddress: string;
    muscleAddress: string;
    opener: 'brains' | 'muscle';
    
    // Details
    reason: string;
    category: 'non_delivery' | 'poor_quality' | 'non_payment' | 'fraud' | 'other';
    
    // Evidence
    evidence: Evidence[];
    
    // Jury
    jury: JuryMember[];
    jurySize: number;
    consensusRequired: number;
    
    // Timing
    createdAt: number;
    juryDeadline?: number;
    votingDeadline?: number;
    resolvedAt?: number;
    
    // Result
    verdict?: VerdictType;
    voteBreakdown?: {
        brainsWin: number;
        muscleWin: number;
        split: number;
        abstain: number;
    };
    
    // Payment resolution
    payment?: {
        brainsReceives: number;
        muscleReceives: number;
        juryReward: number;
        protocolFee: number;
    };
}

export interface Evidence {
    id: string;
    submitter: string;
    type: 'text' | 'image' | 'log' | 'transaction' | 'proof';
    title: string;
    description: string;
    dataHash: string;
    arweaveUrl?: string;
    submittedAt: number;
}

export interface JuryMember {
    agentId: string;
    walletAddress: string;
    invitedAt: number;
    acceptedAt?: number;
    vote?: VerdictType;
    votedAt?: number;
    confidence?: number;
    rewarded: boolean;
}

export class DisputeManager {
    private disputes: Map<string, Dispute> = new Map();
    private agentManager: AgentManager;
    
    private readonly JURY_SIZE = 10;
    private readonly CONSENSUS_REQUIRED = 8;
    private readonly JURY_ACCEPT_TIMEOUT = 300000; // 5 minutes
    private readonly VOTING_TIMEOUT = 1500000; // 25 minutes
    
    constructor(agentManager: AgentManager) {
        this.agentManager = agentManager;
        logger.info('DisputeManager initialized');
    }
    
    // ============== DISPUTE CREATION ==============
    
    openDispute(params: {
        jobId: string;
        brainsAddress: string;
        muscleAddress: string;
        opener: 'brains' | 'muscle';
        reason: string;
        category: Dispute['category'];
    }): Dispute {
        const dispute: Dispute = {
            id: uuidv4(),
            jobId: params.jobId,
            status: 'open',
            brainsAddress: params.brainsAddress,
            muscleAddress: params.muscleAddress,
            opener: params.opener,
            reason: params.reason,
            category: params.category,
            evidence: [],
            jury: [],
            jurySize: this.JURY_SIZE,
            consensusRequired: this.CONSENSUS_REQUIRED,
            createdAt: Date.now()
        };
        
        this.disputes.set(dispute.id, dispute);
        
        logger.info('Dispute opened', { disputeId: dispute.id, jobId: params.jobId });
        
        // Start jury selection
        this.selectJury(dispute);
        
        return dispute;
    }
    
    // ============== EVIDENCE ==============
    
    submitEvidence(disputeId: string, params: {
        submitter: string;
        type: Evidence['type'];
        title: string;
        description: string;
        dataHash: string;
        arweaveUrl?: string;
    }): Evidence | null {
        const dispute = this.disputes.get(disputeId);
        if (!dispute) return null;
        
        // Only parties can submit evidence
        if (params.submitter !== dispute.brainsAddress && params.submitter !== dispute.muscleAddress) {
            return null;
        }
        
        const evidence: Evidence = {
            id: uuidv4(),
            ...params,
            submittedAt: Date.now()
        };
        
        dispute.evidence.push(evidence);
        
        logger.info('Evidence submitted', { disputeId, evidenceId: evidence.id });
        
        return evidence;
    }
    
    // ============== JURY ==============
    
    private selectJury(dispute: Dispute): void {
        dispute.status = 'jury_selection';
        dispute.juryDeadline = Date.now() + this.JURY_ACCEPT_TIMEOUT;
        
        // Get available agents (not parties)
        const available = this.agentManager.getAvailableAgents()
            .filter(a => 
                a.walletAddress !== dispute.brainsAddress && 
                a.walletAddress !== dispute.muscleAddress &&
                a.reputation >= 70 // Only agents with good reputation
            );
        
        // Shuffle and pick
        const shuffled = available.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, this.JURY_SIZE + 5); // Extra in case some decline
        
        for (const agent of selected) {
            const member: JuryMember = {
                agentId: agent.id,
                walletAddress: agent.walletAddress,
                invitedAt: Date.now(),
                rewarded: false
            };
            
            dispute.jury.push(member);
            
            // Send invitation
            this.agentManager.sendToAgent(agent.id, {
                type: 'jury_invite',
                disputeId: dispute.id,
                expiresAt: dispute.juryDeadline,
                casePreview: {
                    category: dispute.category,
                    brainsAddress: dispute.brainsAddress.slice(0, 8) + '...',
                    muscleAddress: dispute.muscleAddress.slice(0, 8) + '...'
                }
            });
        }
        
        logger.info('Jury selection started', { disputeId: dispute.id, invited: selected.length });
    }
    
    acceptJuryInvite(disputeId: string, agentId: string): boolean {
        const dispute = this.disputes.get(disputeId);
        if (!dispute || dispute.status !== 'jury_selection') return false;
        
        const member = dispute.jury.find(j => j.agentId === agentId);
        if (!member || member.acceptedAt) return false;
        
        member.acceptedAt = Date.now();
        
        // Check if we have enough jurors
        const accepted = dispute.jury.filter(j => j.acceptedAt).length;
        if (accepted >= this.JURY_SIZE) {
            this.startVoting(dispute);
        }
        
        return true;
    }
    
    private startVoting(dispute: Dispute): void {
        dispute.status = 'voting';
        dispute.votingDeadline = Date.now() + this.VOTING_TIMEOUT;
        
        // Keep only accepted jurors
        dispute.jury = dispute.jury.filter(j => j.acceptedAt).slice(0, this.JURY_SIZE);
        
        // Send case details to jury
        for (const member of dispute.jury) {
            this.agentManager.sendToAgent(member.agentId, {
                type: 'jury_case',
                disputeId: dispute.id,
                deadline: dispute.votingDeadline,
                case: {
                    reason: dispute.reason,
                    category: dispute.category,
                    evidence: dispute.evidence,
                    brainsAddress: dispute.brainsAddress,
                    muscleAddress: dispute.muscleAddress
                }
            });
        }
        
        logger.info('Voting started', { disputeId: dispute.id, jurors: dispute.jury.length });
    }
    
    // ============== VOTING ==============
    
    submitVote(disputeId: string, agentId: string, vote: VerdictType, confidence: number): boolean {
        const dispute = this.disputes.get(disputeId);
        if (!dispute || dispute.status !== 'voting') return false;
        
        const member = dispute.jury.find(j => j.agentId === agentId && j.acceptedAt);
        if (!member || member.vote) return false;
        
        member.vote = vote;
        member.votedAt = Date.now();
        member.confidence = Math.max(1, Math.min(10, confidence));
        
        logger.info('Vote submitted', { disputeId, agentId, vote });
        
        // Check if all votes are in
        const votes = dispute.jury.filter(j => j.vote);
        if (votes.length >= dispute.jury.length) {
            this.resolveDispute(dispute);
        }
        
        return true;
    }
    
    // ============== RESOLUTION ==============
    
    private resolveDispute(dispute: Dispute): void {
        const votes = dispute.jury.filter(j => j.vote);
        
        // Count votes
        const breakdown = {
            brainsWin: votes.filter(v => v.vote === 'brains_win').length,
            muscleWin: votes.filter(v => v.vote === 'muscle_win').length,
            split: votes.filter(v => v.vote === 'split').length,
            abstain: dispute.jury.length - votes.length
        };
        
        dispute.voteBreakdown = breakdown;
        
        // Determine verdict
        let verdict: VerdictType = 'split';
        
        if (breakdown.brainsWin >= this.CONSENSUS_REQUIRED) {
            verdict = 'brains_win';
        } else if (breakdown.muscleWin >= this.CONSENSUS_REQUIRED) {
            verdict = 'muscle_win';
        } else if (breakdown.brainsWin > breakdown.muscleWin) {
            verdict = 'brains_win';
        } else if (breakdown.muscleWin > breakdown.brainsWin) {
            verdict = 'muscle_win';
        }
        
        dispute.verdict = verdict;
        dispute.status = 'resolved';
        dispute.resolvedAt = Date.now();
        
        // Mark correct voters for rewards
        const winningVote = verdict === 'split' ? 'split' : verdict;
        for (const member of dispute.jury) {
            if (member.vote === winningVote) {
                member.rewarded = true;
                // Increase reputation
                this.agentManager.updateReputation(member.agentId, 2);
            }
        }
        
        logger.info('Dispute resolved', { 
            disputeId: dispute.id, 
            verdict,
            breakdown 
        });
        
        // TODO: Execute payment distribution on Solana
    }
    
    // ============== QUERIES ==============
    
    getDispute(disputeId: string): Dispute | undefined {
        return this.disputes.get(disputeId);
    }
    
    getDisputesByJob(jobId: string): Dispute[] {
        return Array.from(this.disputes.values())
            .filter(d => d.jobId === jobId);
    }
    
    getDisputesByParty(address: string): Dispute[] {
        return Array.from(this.disputes.values())
            .filter(d => d.brainsAddress === address || d.muscleAddress === address);
    }
    
    getActiveDisputes(): Dispute[] {
        return Array.from(this.disputes.values())
            .filter(d => ['open', 'jury_selection', 'voting'].includes(d.status));
    }
    
    getPendingJuryDuties(agentId: string): Dispute[] {
        return Array.from(this.disputes.values())
            .filter(d => {
                if (d.status !== 'voting') return false;
                const member = d.jury.find(j => j.agentId === agentId);
                return member && member.acceptedAt && !member.vote;
            });
    }
    
    // ============== STATS ==============
    
    getStats(): any {
        const disputes = Array.from(this.disputes.values());
        
        return {
            total: disputes.length,
            open: disputes.filter(d => d.status === 'open').length,
            jurySelection: disputes.filter(d => d.status === 'jury_selection').length,
            voting: disputes.filter(d => d.status === 'voting').length,
            resolved: disputes.filter(d => d.status === 'resolved').length,
            byCategory: this.countByCategory(disputes),
            byVerdict: this.countByVerdict(disputes),
            averageResolutionTime: this.calculateAverageResolutionTime(disputes)
        };
    }
    
    private countByCategory(disputes: Dispute[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const d of disputes) {
            counts[d.category] = (counts[d.category] || 0) + 1;
        }
        return counts;
    }
    
    private countByVerdict(disputes: Dispute[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const d of disputes) {
            if (d.verdict) {
                counts[d.verdict] = (counts[d.verdict] || 0) + 1;
            }
        }
        return counts;
    }
    
    private calculateAverageResolutionTime(disputes: Dispute[]): number {
        const resolved = disputes.filter(d => d.resolvedAt);
        if (resolved.length === 0) return 0;
        
        const totalTime = resolved.reduce((sum, d) => {
            return sum + (d.resolvedAt! - d.createdAt);
        }, 0);
        
        return totalTime / resolved.length;
    }
}

