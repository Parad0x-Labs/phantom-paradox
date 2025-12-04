/**
 * PARADOX AGENT SCORING SERVICE
 * 
 * Reputation tiers:
 * - ELITE:     99%+ (9900+) - Priority jobs, lowest fees
 * - EXCELLENT: 95%+ (9500+) - Great reputation
 * - GREAT:     90%+ (9000+) - Solid performer
 * - GOOD:      85%+ (8500+) - Reliable
 * - AVERAGE:   80%+ (8000+) - Standard (new agents start here)
 * - POOR:      70%+ (7000+) - Needs improvement
 * - BAD:       60%+ (6000+) - Probation
 * - TERRIBLE:  50%+ (5000+) - Warning
 * - CRITICAL:  40%+ (4000+) - Last chance
 * - SUSPENDED: 30%+ (3000+) - No new jobs
 * - BANNED:    20%+ (2000+) - Account locked
 * - BLACKLIST: <20%         - Permanently banned
 */

import { logger } from "../shared/logger";
import { query } from "../shared/db";
import crypto from "crypto";

// ============== TYPES ==============

export type ScoreTier = 
    | 'ELITE' | 'EXCELLENT' | 'GREAT' | 'GOOD' | 'AVERAGE'
    | 'POOR' | 'BAD' | 'TERRIBLE' | 'CRITICAL' 
    | 'SUSPENDED' | 'BANNED' | 'BLACKLIST';

export interface AgentScore {
    agentId: string;
    walletAddress: string;
    score: number;           // 0-10000 (basis points)
    scorePercent: number;    // 0-100.00
    tier: ScoreTier;
    
    // Job stats
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    disputedJobs: number;
    disputesWon: number;
    successRate: number;     // 0-100
    
    // Financial
    totalEarnedLamports: bigint;
    totalEarnedSOL: number;
    totalEarnedUSD: number;
    
    // Streaks
    currentStreak: number;
    bestStreak: number;
    
    // Quality
    avgQualityRating: number;   // 1-5
    onTimeRate: number;         // 0-100
    
    // Status
    isActive: boolean;
    isVerified: boolean;
    verificationLevel: number;
    
    // Timestamps
    firstJobAt?: Date;
    lastJobAt?: Date;
}

export interface ScoreChange {
    previousScore: number;
    newScore: number;
    change: number;
    previousTier: ScoreTier;
    newTier: ScoreTier;
    tierChanged: boolean;
    reason: string;
}

// ============== TIER THRESHOLDS ==============

const TIER_THRESHOLDS: Record<ScoreTier, number> = {
    'ELITE': 9900,
    'EXCELLENT': 9500,
    'GREAT': 9000,
    'GOOD': 8500,
    'AVERAGE': 8000,
    'POOR': 7000,
    'BAD': 6000,
    'TERRIBLE': 5000,
    'CRITICAL': 4000,
    'SUSPENDED': 3000,
    'BANNED': 2000,
    'BLACKLIST': 0,
};

const TIER_DISPLAY: Record<ScoreTier, { emoji: string; color: string; description: string }> = {
    'ELITE': { emoji: '👑', color: '#FFD700', description: 'Top 1% - Priority jobs, lowest fees' },
    'EXCELLENT': { emoji: '⭐', color: '#00FF88', description: 'Outstanding performance' },
    'GREAT': { emoji: '✨', color: '#00D4FF', description: 'Excellent work quality' },
    'GOOD': { emoji: '👍', color: '#88FF88', description: 'Reliable agent' },
    'AVERAGE': { emoji: '➖', color: '#AAAAAA', description: 'Standard performance' },
    'POOR': { emoji: '⚠️', color: '#FFAA00', description: 'Needs improvement' },
    'BAD': { emoji: '❌', color: '#FF6600', description: 'On probation' },
    'TERRIBLE': { emoji: '🚫', color: '#FF4444', description: 'Final warning' },
    'CRITICAL': { emoji: '💀', color: '#FF0000', description: 'Last chance' },
    'SUSPENDED': { emoji: '🔒', color: '#880000', description: 'Account suspended' },
    'BANNED': { emoji: '⛔', color: '#440000', description: 'Account banned' },
    'BLACKLIST': { emoji: '☠️', color: '#000000', description: 'Permanently blacklisted' },
};

// ============== HELPER FUNCTIONS ==============

export function getTierFromScore(score: number): ScoreTier {
    if (score >= 9900) return 'ELITE';
    if (score >= 9500) return 'EXCELLENT';
    if (score >= 9000) return 'GREAT';
    if (score >= 8500) return 'GOOD';
    if (score >= 8000) return 'AVERAGE';
    if (score >= 7000) return 'POOR';
    if (score >= 6000) return 'BAD';
    if (score >= 5000) return 'TERRIBLE';
    if (score >= 4000) return 'CRITICAL';
    if (score >= 3000) return 'SUSPENDED';
    if (score >= 2000) return 'BANNED';
    return 'BLACKLIST';
}

export function getTierInfo(tier: ScoreTier) {
    return {
        tier,
        threshold: TIER_THRESHOLDS[tier],
        ...TIER_DISPLAY[tier],
    };
}

export function canTakeJobs(tier: ScoreTier): boolean {
    return !['SUSPENDED', 'BANNED', 'BLACKLIST'].includes(tier);
}

export function getJobMultiplier(tier: ScoreTier): number {
    // Higher tier = better earnings multiplier
    switch (tier) {
        case 'ELITE': return 1.25;       // +25% bonus
        case 'EXCELLENT': return 1.15;   // +15% bonus
        case 'GREAT': return 1.10;       // +10% bonus
        case 'GOOD': return 1.05;        // +5% bonus
        case 'AVERAGE': return 1.00;     // Standard
        case 'POOR': return 0.95;        // -5% penalty
        case 'BAD': return 0.90;         // -10% penalty
        case 'TERRIBLE': return 0.80;    // -20% penalty
        case 'CRITICAL': return 0.70;    // -30% penalty
        default: return 0;               // No jobs
    }
}

// ============== SCORE CALCULATION ==============

export interface JobResult {
    success: boolean;
    qualityScore: number;     // 0-100
    wasOnTime: boolean;
    earnedLamports: bigint;
    clientRating?: number;    // 1-5
    jobType: string;
}

export function calculateScoreChange(
    currentScore: number,
    result: JobResult,
    currentStreak: number
): { newScore: number; change: number; breakdown: string[] } {
    let change = 0;
    const breakdown: string[] = [];
    
    if (result.success) {
        // Base success bonus
        change += 10;
        breakdown.push('+10 (job completed)');
        
        // Quality bonus (0-50 based on quality score)
        const qualityBonus = Math.floor(result.qualityScore / 2);
        change += qualityBonus;
        if (qualityBonus > 0) {
            breakdown.push(`+${qualityBonus} (quality: ${result.qualityScore}%)`);
        }
        
        // On-time bonus
        if (result.wasOnTime) {
            change += 20;
            breakdown.push('+20 (on time)');
        }
        
        // Client rating bonus
        if (result.clientRating) {
            const ratingBonus = (result.clientRating - 3) * 10; // -20 to +20
            change += ratingBonus;
            if (ratingBonus !== 0) {
                breakdown.push(`${ratingBonus > 0 ? '+' : ''}${ratingBonus} (client ${result.clientRating}★)`);
            }
        }
        
        // Streak bonus (max +50 for 10+ streak)
        if (currentStreak >= 3) {
            const streakBonus = Math.min(50, currentStreak * 5);
            change += streakBonus;
            breakdown.push(`+${streakBonus} (${currentStreak} streak)`);
        }
        
        // Cap max gain
        change = Math.min(change, 150);
        
    } else {
        // Failure penalty
        change -= 100;
        breakdown.push('-100 (job failed)');
        
        // Extra penalty for consecutive failures
        if (currentStreak === 0) {
            change -= 50;
            breakdown.push('-50 (consecutive failure)');
        }
        
        // Cap max loss
        change = Math.max(change, -200);
    }
    
    const newScore = Math.max(0, Math.min(10000, currentScore + change));
    
    return { newScore, change, breakdown };
}

// ============== DATABASE OPERATIONS ==============

export async function getAgentScore(agentId: string): Promise<AgentScore | null> {
    try {
        const result = await query(`
            SELECT * FROM agent_scores WHERE agent_id = $1
        `, [agentId]);
        
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        return {
            agentId: row.agent_id,
            walletAddress: row.wallet_address,
            score: row.reputation_score,
            scorePercent: row.reputation_score / 100,
            tier: row.tier as ScoreTier,
            totalJobs: row.total_jobs_completed + row.total_jobs_failed,
            completedJobs: row.total_jobs_completed,
            failedJobs: row.total_jobs_failed,
            disputedJobs: row.total_jobs_disputed,
            disputesWon: row.total_jobs_won,
            successRate: row.total_jobs_completed / (row.total_jobs_completed + row.total_jobs_failed || 1) * 100,
            totalEarnedLamports: BigInt(row.total_earned_lamports),
            totalEarnedSOL: Number(row.total_earned_lamports) / 1e9,
            totalEarnedUSD: Number(row.total_earned_usd),
            currentStreak: row.current_streak,
            bestStreak: row.best_streak,
            avgQualityRating: row.avg_quality_rating / 100,
            onTimeRate: row.on_time_rate / 100,
            isActive: row.is_active,
            isVerified: row.is_verified,
            verificationLevel: row.verification_level,
            firstJobAt: row.first_job_at,
            lastJobAt: row.last_job_at,
        };
    } catch (err) {
        logger.error('Failed to get agent score', { agentId, err });
        return null;
    }
}

export async function updateAgentScore(
    agentId: string,
    walletAddress: string,
    result: JobResult
): Promise<ScoreChange | null> {
    try {
        // Get current score
        let currentScore = await getAgentScore(agentId);
        
        if (!currentScore) {
            // Create new agent with default score
            await query(`
                INSERT INTO agent_scores (agent_id, wallet_address, reputation_score, tier)
                VALUES ($1, $2, 8000, 'AVERAGE')
            `, [agentId, walletAddress]);
            
            currentScore = {
                agentId,
                walletAddress,
                score: 8000,
                scorePercent: 80,
                tier: 'AVERAGE',
                totalJobs: 0,
                completedJobs: 0,
                failedJobs: 0,
                disputedJobs: 0,
                disputesWon: 0,
                successRate: 100,
                totalEarnedLamports: 0n,
                totalEarnedSOL: 0,
                totalEarnedUSD: 0,
                currentStreak: 0,
                bestStreak: 0,
                avgQualityRating: 0,
                onTimeRate: 100,
                isActive: true,
                isVerified: false,
                verificationLevel: 0,
            };
        }
        
        const { newScore, change, breakdown } = calculateScoreChange(
            currentScore.score,
            result,
            currentScore.currentStreak
        );
        
        const previousTier = currentScore.tier;
        const newTier = getTierFromScore(newScore);
        
        // Update database
        await query(`
            UPDATE agent_scores SET
                reputation_score = $2,
                tier = $3,
                total_jobs_completed = total_jobs_completed + $4,
                total_jobs_failed = total_jobs_failed + $5,
                total_earned_lamports = total_earned_lamports + $6,
                current_streak = CASE WHEN $7 THEN current_streak + 1 ELSE 0 END,
                best_streak = GREATEST(best_streak, CASE WHEN $7 THEN current_streak + 1 ELSE best_streak END),
                last_job_success = $7,
                last_job_at = NOW(),
                first_job_at = COALESCE(first_job_at, NOW()),
                updated_at = NOW()
            WHERE agent_id = $1
        `, [
            agentId,
            newScore,
            newTier,
            result.success ? 1 : 0,
            result.success ? 0 : 1,
            result.earnedLamports.toString(),
            result.success,
        ]);
        
        logger.info('Agent score updated', {
            agentId,
            previousScore: currentScore.score,
            newScore,
            change,
            previousTier,
            newTier,
            breakdown,
        });
        
        return {
            previousScore: currentScore.score,
            newScore,
            change,
            previousTier,
            newTier,
            tierChanged: previousTier !== newTier,
            reason: breakdown.join(', '),
        };
        
    } catch (err) {
        logger.error('Failed to update agent score', { agentId, err });
        return null;
    }
}

// ============== LEADERBOARD ==============

export async function getLeaderboard(limit: number = 50): Promise<AgentScore[]> {
    try {
        const result = await query(`
            SELECT * FROM agent_scores
            WHERE is_active = true
            ORDER BY reputation_score DESC, total_earned_lamports DESC
            LIMIT $1
        `, [limit]);
        
        return result.rows.map(row => ({
            agentId: row.agent_id,
            walletAddress: row.wallet_address,
            score: row.reputation_score,
            scorePercent: row.reputation_score / 100,
            tier: row.tier as ScoreTier,
            totalJobs: row.total_jobs_completed + row.total_jobs_failed,
            completedJobs: row.total_jobs_completed,
            failedJobs: row.total_jobs_failed,
            disputedJobs: row.total_jobs_disputed,
            disputesWon: row.total_jobs_won,
            successRate: row.total_jobs_completed / (row.total_jobs_completed + row.total_jobs_failed || 1) * 100,
            totalEarnedLamports: BigInt(row.total_earned_lamports),
            totalEarnedSOL: Number(row.total_earned_lamports) / 1e9,
            totalEarnedUSD: Number(row.total_earned_usd),
            currentStreak: row.current_streak,
            bestStreak: row.best_streak,
            avgQualityRating: row.avg_quality_rating / 100,
            onTimeRate: row.on_time_rate / 100,
            isActive: row.is_active,
            isVerified: row.is_verified,
            verificationLevel: row.verification_level,
            firstJobAt: row.first_job_at,
            lastJobAt: row.last_job_at,
        }));
    } catch (err) {
        logger.error('Failed to get leaderboard', { err });
        return [];
    }
}

export async function getTierDistribution(): Promise<Record<ScoreTier, number>> {
    try {
        const result = await query(`
            SELECT tier, COUNT(*) as count
            FROM agent_scores
            WHERE is_active = true
            GROUP BY tier
        `);
        
        const distribution: Record<ScoreTier, number> = {
            'ELITE': 0, 'EXCELLENT': 0, 'GREAT': 0, 'GOOD': 0, 'AVERAGE': 0,
            'POOR': 0, 'BAD': 0, 'TERRIBLE': 0, 'CRITICAL': 0,
            'SUSPENDED': 0, 'BANNED': 0, 'BLACKLIST': 0,
        };
        
        for (const row of result.rows) {
            distribution[row.tier as ScoreTier] = parseInt(row.count);
        }
        
        return distribution;
    } catch (err) {
        logger.error('Failed to get tier distribution', { err });
        return {} as Record<ScoreTier, number>;
    }
}

export default {
    getTierFromScore,
    getTierInfo,
    canTakeJobs,
    getJobMultiplier,
    calculateScoreChange,
    getAgentScore,
    updateAgentScore,
    getLeaderboard,
    getTierDistribution,
};

