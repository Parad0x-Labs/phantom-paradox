/**
 * PARADOX ACCOUNTING SERVICE
 * 
 * Corporate-level financial tracking:
 * - Every transaction logged to ledger
 * - Daily summaries for reporting
 * - Full audit trail
 * - SOL/USDC/PDOX support
 * - Devnet SOL payments
 */

import { Router } from "express";
import { logger } from "../shared/logger";
import { asyncHandler } from "./middleware";
import { query } from "../shared/db";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "crypto";

const router = Router();

// Devnet RPC
const DEVNET_RPC = "https://api.devnet.solana.com";
const connection = new Connection(DEVNET_RPC, "confirmed");

// ============== TYPES ==============

export type LedgerEntryType = 
    | 'JOB_PAYMENT' | 'JOB_REFUND' | 'DISPUTE_PAYOUT'
    | 'PENALTY' | 'BONUS' | 'STAKE' | 'UNSTAKE'
    | 'FEE' | 'ADJUSTMENT' | 'AIRDROP';

export type EntryStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED';

export interface LedgerEntry {
    entryId: string;
    entryType: LedgerEntryType;
    fromWallet?: string;
    toWallet: string;
    amountLamports: bigint;
    amountUSD?: number;
    token: 'SOL' | 'USDC' | 'PDOX';
    jobId?: string;
    disputeId?: string;
    agentId?: string;
    txSignature?: string;
    txConfirmed: boolean;
    description: string;
    metadata: Record<string, any>;
    status: EntryStatus;
    createdAt: Date;
}

export interface DailyAccounting {
    date: string;
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    disputedJobs: number;
    totalVolumeLamports: bigint;
    agentPayoutsLamports: bigint;
    platformFeesLamports: bigint;
    refundsLamports: bigint;
    penaltiesLamports: bigint;
    totalVolumeUSD: number;
    activeAgents: number;
    newAgents: number;
    jobsByType: Record<string, number>;
}

// ============== LEDGER OPERATIONS ==============

export async function createLedgerEntry(entry: Omit<LedgerEntry, 'entryId' | 'createdAt'>): Promise<string> {
    const entryId = `LED-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    try {
        await query(`
            INSERT INTO ledger_entries (
                entry_id, entry_type, from_wallet, to_wallet,
                amount_lamports, amount_usd, token,
                job_id, dispute_id, agent_id,
                tx_signature, tx_confirmed, description, metadata, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            entryId,
            entry.entryType,
            entry.fromWallet || null,
            entry.toWallet,
            entry.amountLamports.toString(),
            entry.amountUSD || null,
            entry.token,
            entry.jobId || null,
            entry.disputeId || null,
            entry.agentId || null,
            entry.txSignature || null,
            entry.txConfirmed,
            entry.description,
            JSON.stringify(entry.metadata),
            entry.status,
        ]);
        
        logger.info('Ledger entry created', {
            entryId,
            type: entry.entryType,
            amount: entry.amountLamports.toString(),
            to: entry.toWallet.substring(0, 8),
        });
        
        return entryId;
        
    } catch (err) {
        logger.error('Failed to create ledger entry', { err });
        throw err;
    }
}

export async function confirmLedgerEntry(entryId: string, txSignature: string): Promise<void> {
    await query(`
        UPDATE ledger_entries 
        SET tx_signature = $2, tx_confirmed = true, status = 'CONFIRMED'
        WHERE entry_id = $1
    `, [entryId, txSignature]);
    
    logger.info('Ledger entry confirmed', { entryId, txSignature });
}

export async function failLedgerEntry(entryId: string, reason: string): Promise<void> {
    await query(`
        UPDATE ledger_entries 
        SET status = 'FAILED', metadata = metadata || $2
        WHERE entry_id = $1
    `, [entryId, JSON.stringify({ failReason: reason })]);
    
    logger.warn('Ledger entry failed', { entryId, reason });
}

// ============== JOB PAYMENT ==============

export async function recordJobPayment(
    jobId: string,
    agentWallet: string,
    agentId: string,
    amountLamports: bigint,
    jobType: string,
    txSignature?: string
): Promise<string> {
    // Calculate fee split: 97% agent, 3% platform
    const agentShare = (amountLamports * 97n) / 100n;
    const platformFee = amountLamports - agentShare;
    
    // Create agent payment entry
    const entryId = await createLedgerEntry({
        entryType: 'JOB_PAYMENT',
        toWallet: agentWallet,
        amountLamports: agentShare,
        token: 'SOL',
        jobId,
        agentId,
        txSignature,
        txConfirmed: !!txSignature,
        description: `Payment for ${jobType} job ${jobId.substring(0, 8)}`,
        metadata: {
            totalAmount: amountLamports.toString(),
            agentShare: agentShare.toString(),
            platformFee: platformFee.toString(),
            jobType,
        },
        status: txSignature ? 'CONFIRMED' : 'PENDING',
    });
    
    // Create platform fee entry
    await createLedgerEntry({
        entryType: 'FEE',
        fromWallet: agentWallet,
        toWallet: 'PLATFORM_TREASURY',
        amountLamports: platformFee,
        token: 'SOL',
        jobId,
        agentId,
        txConfirmed: !!txSignature,
        description: `Platform fee (3%) for job ${jobId.substring(0, 8)}`,
        metadata: { linkedEntry: entryId },
        status: txSignature ? 'CONFIRMED' : 'PENDING',
    });
    
    // Log to job audit
    await logJobAudit(jobId, jobType, 'COMPLETED', 'SYSTEM', undefined, agentId, {
        previousStatus: 'IN_PROGRESS',
        newStatus: 'COMPLETED',
        paymentEntryId: entryId,
        amountLamports: amountLamports.toString(),
    });
    
    return entryId;
}

// ============== PENALTIES & REFUNDS ==============

export async function recordPenalty(
    agentWallet: string,
    agentId: string,
    amountLamports: bigint,
    reason: string,
    jobId?: string
): Promise<string> {
    return await createLedgerEntry({
        entryType: 'PENALTY',
        fromWallet: agentWallet,
        toWallet: 'PENALTY_POOL',
        amountLamports,
        token: 'SOL',
        jobId,
        agentId,
        txConfirmed: false,
        description: `Penalty: ${reason}`,
        metadata: { reason },
        status: 'PENDING',
    });
}

export async function recordRefund(
    clientWallet: string,
    amountLamports: bigint,
    reason: string,
    jobId: string
): Promise<string> {
    return await createLedgerEntry({
        entryType: 'JOB_REFUND',
        fromWallet: 'ESCROW',
        toWallet: clientWallet,
        amountLamports,
        token: 'SOL',
        jobId,
        txConfirmed: false,
        description: `Refund: ${reason}`,
        metadata: { reason },
        status: 'PENDING',
    });
}

// ============== JOB AUDIT LOG ==============

export async function logJobAudit(
    jobId: string,
    jobType: string,
    action: string,
    actorType: 'CLIENT' | 'AGENT' | 'SYSTEM' | 'ADMIN',
    actorWallet?: string,
    agentId?: string,
    details?: Record<string, any>
): Promise<void> {
    const auditId = `AUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    try {
        await query(`
            INSERT INTO job_audit_log (
                audit_id, job_id, job_type, action,
                actor_type, actor_wallet, actor_agent_id,
                previous_status, new_status, details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            auditId,
            jobId,
            jobType,
            action,
            actorType,
            actorWallet || null,
            agentId || null,
            details?.previousStatus || null,
            details?.newStatus || null,
            JSON.stringify(details || {}),
        ]);
    } catch (err) {
        logger.warn('Failed to log job audit', { jobId, action, err });
    }
}

// ============== DAILY ACCOUNTING ==============

export async function updateDailyAccounting(
    jobSuccess: boolean,
    jobType: string,
    amountLamports: bigint,
    isNewAgent: boolean
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const agentPayout = (amountLamports * 97n) / 100n;
    const platformFee = amountLamports - agentPayout;
    
    try {
        await query(`
            INSERT INTO daily_accounting (date, total_jobs, successful_jobs, failed_jobs,
                total_volume_lamports, agent_payouts_lamports, platform_fees_lamports,
                active_agents, new_agents, jobs_by_type)
            VALUES ($1, 1, $2, $3, $4, $5, $6, 1, $7, $8)
            ON CONFLICT (date) DO UPDATE SET
                total_jobs = daily_accounting.total_jobs + 1,
                successful_jobs = daily_accounting.successful_jobs + $2,
                failed_jobs = daily_accounting.failed_jobs + $3,
                total_volume_lamports = daily_accounting.total_volume_lamports + $4,
                agent_payouts_lamports = daily_accounting.agent_payouts_lamports + $5,
                platform_fees_lamports = daily_accounting.platform_fees_lamports + $6,
                new_agents = daily_accounting.new_agents + $7,
                jobs_by_type = daily_accounting.jobs_by_type || $8,
                updated_at = NOW()
        `, [
            today,
            jobSuccess ? 1 : 0,
            jobSuccess ? 0 : 1,
            amountLamports.toString(),
            agentPayout.toString(),
            platformFee.toString(),
            isNewAgent ? 1 : 0,
            JSON.stringify({ [jobType]: 1 }),
        ]);
    } catch (err) {
        logger.warn('Failed to update daily accounting', { err });
    }
}

export async function getDailyReport(date?: string): Promise<DailyAccounting | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        const result = await query(`
            SELECT * FROM daily_accounting WHERE date = $1
        `, [targetDate]);
        
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        return {
            date: row.date,
            totalJobs: row.total_jobs,
            successfulJobs: row.successful_jobs,
            failedJobs: row.failed_jobs,
            disputedJobs: row.disputed_jobs,
            totalVolumeLamports: BigInt(row.total_volume_lamports),
            agentPayoutsLamports: BigInt(row.agent_payouts_lamports),
            platformFeesLamports: BigInt(row.platform_fees_lamports),
            refundsLamports: BigInt(row.refunds_lamports),
            penaltiesLamports: BigInt(row.penalties_lamports),
            totalVolumeUSD: Number(row.total_volume_usd),
            activeAgents: row.active_agents,
            newAgents: row.new_agents,
            jobsByType: row.jobs_by_type,
        };
    } catch (err) {
        logger.error('Failed to get daily report', { date: targetDate, err });
        return null;
    }
}

// ============== DEVNET SOL PAYMENT ==============

export async function sendDevnetPayment(
    toWallet: string,
    amountLamports: bigint,
    jobId: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
        // For devnet simulation, we just log and return success
        // In production, this would actually send SOL
        
        const signature = `devnet_sim_${crypto.randomBytes(32).toString('hex')}`;
        
        logger.info('Devnet payment simulated', {
            to: toWallet.substring(0, 8),
            amount: Number(amountLamports) / LAMPORTS_PER_SOL,
            jobId: jobId.substring(0, 8),
            signature: signature.substring(0, 16),
        });
        
        return { success: true, signature };
        
    } catch (err: any) {
        logger.error('Devnet payment failed', { err });
        return { success: false, error: err.message };
    }
}

// ============== API ROUTES ==============

/**
 * GET /api/accounting/ledger
 * Get ledger entries with filters
 */
router.get('/ledger', asyncHandler(async (req, res) => {
    const { type, wallet, status, limit = 50 } = req.query;
    
    let sql = 'SELECT * FROM ledger_entries WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;
    
    if (type) {
        params.push(type);
        sql += ` AND entry_type = $${++paramCount}`;
    }
    if (wallet) {
        params.push(wallet);
        sql += ` AND (from_wallet = $${++paramCount} OR to_wallet = $${paramCount})`;
    }
    if (status) {
        params.push(status);
        sql += ` AND status = $${++paramCount}`;
    }
    
    params.push(Math.min(Number(limit), 500));
    sql += ` ORDER BY created_at DESC LIMIT $${++paramCount}`;
    
    const result = await query(sql, params);
    
    res.json({
        count: result.rows.length,
        entries: result.rows.map(row => ({
            entryId: row.entry_id,
            type: row.entry_type,
            from: row.from_wallet,
            to: row.to_wallet,
            amountSOL: Number(row.amount_lamports) / LAMPORTS_PER_SOL,
            amountLamports: row.amount_lamports,
            token: row.token,
            jobId: row.job_id,
            txSignature: row.tx_signature,
            status: row.status,
            description: row.description,
            createdAt: row.created_at,
        })),
    });
}));

/**
 * GET /api/accounting/daily
 * Get daily accounting report
 */
router.get('/daily', asyncHandler(async (req, res) => {
    const { date } = req.query;
    const report = await getDailyReport(date as string);
    
    if (!report) {
        return res.json({
            date: date || new Date().toISOString().split('T')[0],
            message: 'No data for this date',
        });
    }
    
    res.json({
        ...report,
        totalVolumeSOL: Number(report.totalVolumeLamports) / LAMPORTS_PER_SOL,
        agentPayoutsSOL: Number(report.agentPayoutsLamports) / LAMPORTS_PER_SOL,
        platformFeesSOL: Number(report.platformFeesLamports) / LAMPORTS_PER_SOL,
    });
}));

/**
 * GET /api/accounting/audit/:jobId
 * Get audit trail for a job
 */
router.get('/audit/:jobId', asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    
    const result = await query(`
        SELECT * FROM job_audit_log
        WHERE job_id = $1
        ORDER BY timestamp ASC
    `, [jobId]);
    
    res.json({
        jobId,
        entries: result.rows.length,
        audit: result.rows.map(row => ({
            auditId: row.audit_id,
            action: row.action,
            actorType: row.actor_type,
            actor: row.actor_wallet || row.actor_agent_id,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            details: row.details,
            timestamp: row.timestamp,
        })),
    });
}));

/**
 * GET /api/accounting/summary
 * Get accounting summary (last 7 days)
 */
router.get('/summary', asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT 
            SUM(total_jobs) as total_jobs,
            SUM(successful_jobs) as successful_jobs,
            SUM(failed_jobs) as failed_jobs,
            SUM(total_volume_lamports) as total_volume,
            SUM(agent_payouts_lamports) as agent_payouts,
            SUM(platform_fees_lamports) as platform_fees,
            MAX(active_agents) as peak_agents
        FROM daily_accounting
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    `);
    
    const row = result.rows[0];
    
    res.json({
        period: 'last_7_days',
        totalJobs: Number(row.total_jobs) || 0,
        successfulJobs: Number(row.successful_jobs) || 0,
        failedJobs: Number(row.failed_jobs) || 0,
        successRate: row.total_jobs > 0 
            ? ((row.successful_jobs / row.total_jobs) * 100).toFixed(2) + '%'
            : 'N/A',
        totalVolumeSOL: (Number(row.total_volume) || 0) / LAMPORTS_PER_SOL,
        agentPayoutsSOL: (Number(row.agent_payouts) || 0) / LAMPORTS_PER_SOL,
        platformFeesSOL: (Number(row.platform_fees) || 0) / LAMPORTS_PER_SOL,
        peakAgents: Number(row.peak_agents) || 0,
    });
}));

export default router;

