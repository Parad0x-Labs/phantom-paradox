/**
 * JOB MANAGER
 * 
 * Handles job lifecycle:
 * - Job creation and queuing
 * - Assignment to agents
 * - Progress tracking
 * - Completion and payment
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { AgentManager, Agent } from './AgentManager';

export type JobType = 'relay' | 'compute' | 'verify' | 'storage';
export type JobStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'disputed' | 'cancelled';

export interface Job {
    id: string;
    type: JobType;
    status: JobStatus;
    
    // Parties
    brainsAddress: string;  // Buyer
    muscleAddress?: string; // Assigned agent
    muscleAgentId?: string;
    
    // Details
    description: string;
    requirements: {
        minBandwidth?: number;
        minReputation?: number;
        capabilities?: string[];
    };
    
    // Payment
    payment: {
        amount: number;         // lamports
        currency: 'SOL' | 'USDC';
        escrowTxId?: string;
        paid: number;           // Amount paid so far
    };
    
    // Timing
    createdAt: number;
    assignedAt?: number;
    startedAt?: number;
    completedAt?: number;
    deadline?: number;
    
    // Progress
    progress: number;           // 0-100
    metrics: {
        bytesProcessed?: number;
        computeCycles?: number;
        duration?: number;
    };
    
    // Result
    result?: {
        success: boolean;
        output?: string;
        proofHash?: string;
    };
    
    // Auto-approve settings
    autoApprove: boolean;
    approvalDeadline?: number;
}

export class JobManager {
    private jobs: Map<string, Job> = new Map();
    private pendingQueue: string[] = [];
    private agentManager: AgentManager;
    
    private readonly ASSIGNMENT_INTERVAL = 5000; // 5 seconds
    private readonly AUTO_APPROVE_TIMEOUT = 86400000; // 24 hours
    
    constructor(agentManager: AgentManager) {
        this.agentManager = agentManager;
        logger.info('JobManager initialized');
    }
    
    // ============== JOB CREATION ==============
    
    createJob(params: {
        type: JobType;
        brainsAddress: string;
        description: string;
        requirements?: Job['requirements'];
        payment: { amount: number; currency: 'SOL' | 'USDC'; escrowTxId?: string };
        deadline?: number;
        autoApprove?: boolean;
    }): Job {
        const job: Job = {
            id: uuidv4(),
            type: params.type,
            status: 'pending',
            brainsAddress: params.brainsAddress,
            description: params.description,
            requirements: params.requirements || {},
            payment: {
                ...params.payment,
                paid: 0
            },
            createdAt: Date.now(),
            deadline: params.deadline,
            progress: 0,
            metrics: {},
            autoApprove: params.autoApprove ?? true
        };
        
        this.jobs.set(job.id, job);
        this.pendingQueue.push(job.id);
        
        logger.info('Job created', { jobId: job.id, type: job.type, brains: job.brainsAddress });
        
        return job;
    }
    
    // ============== JOB ASSIGNMENT ==============
    
    startAssignmentLoop(): void {
        setInterval(() => this.processAssignments(), this.ASSIGNMENT_INTERVAL);
        logger.info('Job assignment loop started');
    }
    
    private processAssignments(): void {
        while (this.pendingQueue.length > 0) {
            const jobId = this.pendingQueue[0];
            const job = this.jobs.get(jobId);
            
            if (!job || job.status !== 'pending') {
                this.pendingQueue.shift();
                continue;
            }
            
            // Find suitable agent
            const agent = this.findBestAgent(job);
            
            if (agent) {
                this.assignJob(job, agent);
                this.pendingQueue.shift();
            } else {
                // No agent available, keep in queue
                break;
            }
        }
    }
    
    private findBestAgent(job: Job): Agent | null {
        const available = this.agentManager.getAvailableAgents(job.type);
        
        // Filter by requirements
        const suitable = available.filter(agent => {
            if (job.requirements.minBandwidth && agent.config.maxBandwidth < job.requirements.minBandwidth) {
                return false;
            }
            if (job.requirements.minReputation && agent.reputation < job.requirements.minReputation) {
                return false;
            }
            if (job.requirements.capabilities) {
                for (const cap of job.requirements.capabilities) {
                    if (!agent.capabilities.includes(cap)) return false;
                }
            }
            return true;
        });
        
        if (suitable.length === 0) return null;
        
        // Sort by reputation (higher = better)
        suitable.sort((a, b) => b.reputation - a.reputation);
        
        return suitable[0];
    }
    
    private assignJob(job: Job, agent: Agent): void {
        job.status = 'assigned';
        job.muscleAddress = agent.walletAddress;
        job.muscleAgentId = agent.id;
        job.assignedAt = Date.now();
        
        // Mark agent as busy
        this.agentManager.setAgentBusy(agent.id, job.id);
        
        // Notify agent
        this.agentManager.sendToAgent(agent.id, {
            type: 'job_assignment',
            job: {
                id: job.id,
                type: job.type,
                description: job.description,
                payment: job.payment,
                deadline: job.deadline
            }
        });
        
        logger.info('Job assigned', { jobId: job.id, agentId: agent.id });
    }
    
    // ============== JOB PROGRESS ==============
    
    handleJobProgress(message: any): void {
        const { jobId, progress, metrics } = message;
        
        const job = this.jobs.get(jobId);
        if (!job) return;
        
        if (job.status === 'assigned') {
            job.status = 'in_progress';
            job.startedAt = Date.now();
        }
        
        job.progress = progress || job.progress;
        job.metrics = { ...job.metrics, ...metrics };
        
        // Stream payment based on progress
        if (job.autoApprove && progress > 0) {
            this.streamPayment(job, progress);
        }
    }
    
    private streamPayment(job: Job, progress: number): void {
        const targetPaid = Math.floor(job.payment.amount * (progress / 100));
        const toPay = targetPaid - job.payment.paid;
        
        if (toPay > 0) {
            // TODO: Execute actual payment on Solana
            job.payment.paid = targetPaid;
            
            logger.info('Streamed payment', { 
                jobId: job.id, 
                paid: toPay, 
                totalPaid: job.payment.paid 
            });
        }
    }
    
    // ============== JOB COMPLETION ==============
    
    handleJobComplete(message: any): void {
        const { jobId, success, output, proofHash, metrics } = message;
        
        const job = this.jobs.get(jobId);
        if (!job) return;
        
        job.status = 'completed';
        job.completedAt = Date.now();
        job.progress = 100;
        job.metrics = { ...job.metrics, ...metrics };
        job.result = { success, output, proofHash };
        
        // Release agent
        if (job.muscleAgentId) {
            this.agentManager.setAgentAvailable(job.muscleAgentId);
            
            // Update reputation
            if (success) {
                this.agentManager.updateReputation(job.muscleAgentId, 1);
            } else {
                this.agentManager.updateReputation(job.muscleAgentId, -2);
            }
        }
        
        // Handle payment
        if (job.autoApprove && success) {
            this.finalizePayment(job);
        } else {
            // Manual approval required
            job.approvalDeadline = Date.now() + this.AUTO_APPROVE_TIMEOUT;
        }
        
        logger.info('Job completed', { jobId: job.id, success });
    }
    
    private finalizePayment(job: Job): void {
        const remaining = job.payment.amount - job.payment.paid;
        
        if (remaining > 0) {
            // TODO: Execute final payment on Solana
            job.payment.paid = job.payment.amount;
            
            logger.info('Payment finalized', { jobId: job.id, total: job.payment.amount });
        }
    }
    
    // ============== QUERIES ==============
    
    getJob(jobId: string): Job | undefined {
        return this.jobs.get(jobId);
    }
    
    getJobsByBrains(brainsAddress: string): Job[] {
        return Array.from(this.jobs.values())
            .filter(j => j.brainsAddress === brainsAddress);
    }
    
    getJobsByMuscle(muscleAddress: string): Job[] {
        return Array.from(this.jobs.values())
            .filter(j => j.muscleAddress === muscleAddress);
    }
    
    getActiveJobs(): Job[] {
        return Array.from(this.jobs.values())
            .filter(j => ['pending', 'assigned', 'in_progress'].includes(j.status));
    }
    
    getActiveCount(): number {
        return this.getActiveJobs().length;
    }
    
    getPendingCount(): number {
        return this.pendingQueue.length;
    }
    
    // ============== ACTIONS ==============
    
    approveJob(jobId: string, brainsAddress: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || job.brainsAddress !== brainsAddress || job.status !== 'completed') {
            return false;
        }
        
        this.finalizePayment(job);
        return true;
    }
    
    rejectJob(jobId: string, brainsAddress: string, reason: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || job.brainsAddress !== brainsAddress) {
            return false;
        }
        
        job.status = 'disputed';
        logger.info('Job rejected, opening dispute', { jobId, reason });
        
        return true;
    }
    
    cancelJob(jobId: string, brainsAddress: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || job.brainsAddress !== brainsAddress) {
            return false;
        }
        
        if (job.status === 'pending') {
            job.status = 'cancelled';
            // Remove from queue
            const idx = this.pendingQueue.indexOf(jobId);
            if (idx >= 0) this.pendingQueue.splice(idx, 1);
            return true;
        }
        
        return false;
    }
    
    // ============== STATS ==============
    
    getStats(): any {
        const jobs = Array.from(this.jobs.values());
        
        return {
            total: jobs.length,
            pending: jobs.filter(j => j.status === 'pending').length,
            assigned: jobs.filter(j => j.status === 'assigned').length,
            inProgress: jobs.filter(j => j.status === 'in_progress').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            disputed: jobs.filter(j => j.status === 'disputed').length,
            byType: this.countByType(jobs),
            totalPayments: jobs.reduce((sum, j) => sum + j.payment.paid, 0),
            averageCompletionTime: this.calculateAverageCompletionTime(jobs)
        };
    }
    
    private countByType(jobs: Job[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const job of jobs) {
            counts[job.type] = (counts[job.type] || 0) + 1;
        }
        return counts;
    }
    
    private calculateAverageCompletionTime(jobs: Job[]): number {
        const completed = jobs.filter(j => j.completedAt && j.startedAt);
        if (completed.length === 0) return 0;
        
        const totalTime = completed.reduce((sum, j) => {
            return sum + (j.completedAt! - j.startedAt!);
        }, 0);
        
        return totalTime / completed.length;
    }
}

