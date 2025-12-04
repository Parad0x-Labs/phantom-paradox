/**
 * PARADOX JOB SIMULATOR
 * Real-life job simulations - Brain orders, Muscle delivers
 * Pay with Devnet SOL, track scores, full accounting
 */

import { Router } from "express";
import { logger } from "../shared/logger";
import { asyncHandler } from "./middleware";
import crypto from "crypto";

const router = Router();
const LAMPORTS_PER_SOL = 1_000_000_000;

// ============== TYPES ==============
export type JobCategory = 'RELAY' | 'AI_IMAGE' | 'AI_AUDIO' | 'AI_TEXT' | 'AI_VIDEO' | 'VERIFICATION' | 'STORAGE' | 'COMPUTE';
export type JobStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'DISPUTED';

export interface SimJob {
    id: string;
    category: JobCategory;
    type: string;
    title: string;
    desc: string;
    requirements: string[];
    priceLamports: bigint;
    estSecs: number;
    input: { type: string; size: string; format: string };
    status: JobStatus;
    clientId: string;
    agentId?: string;
    agentWallet?: string;
    createdAt: Date;
    deadline: Date;
    assignedAt?: Date;
    completedAt?: Date;
    quality?: number;
    onTime?: boolean;
}

// ============== JOB TEMPLATES ==============
const TEMPLATES = [
    // RELAY
    { cat: 'RELAY', type: 'vpn_tunnel', title: 'VPN Traffic Relay', desc: 'Route encrypted traffic', req: ['10+ Mbps', 'Low latency'], rate: 1_000_000, unit: 'MB', min: 10, max: 500, secs: 1 },
    { cat: 'RELAY', type: 'geo_unlock', title: 'Geo-Unlock Relay', desc: 'Region-locked content', req: ['Residential IP', 'Good bandwidth'], rate: 2_000_000, unit: 'MB', min: 50, max: 2000, secs: 0.5 },
    // AI IMAGE
    { cat: 'AI_IMAGE', type: 'photo_enhance', title: '4x Photo Upscale', desc: 'Real-ESRGAN enhancement', req: ['GPU', '2GB+ VRAM'], rate: 20_000_000, unit: 'image', min: 1, max: 10, secs: 30 },
    { cat: 'AI_IMAGE', type: 'bg_remove', title: 'Background Removal', desc: 'U2Net segmentation', req: ['4GB RAM'], rate: 10_000_000, unit: 'image', min: 1, max: 50, secs: 10 },
    { cat: 'AI_IMAGE', type: 'style_transfer', title: 'Style Transfer', desc: 'Artistic style (Van Gogh)', req: ['GPU', '4GB+ VRAM'], rate: 30_000_000, unit: 'image', min: 1, max: 5, secs: 60 },
    { cat: 'AI_IMAGE', type: 'face_restore', title: 'Face Restoration', desc: 'GFPGAN old photo fix', req: ['GPU'], rate: 25_000_000, unit: 'image', min: 1, max: 20, secs: 20 },
    // AI AUDIO  
    { cat: 'AI_AUDIO', type: 'transcribe', title: 'Audio Transcription', desc: 'Whisper speech-to-text', req: ['CPU intensive'], rate: 50_000_000, unit: 'minute', min: 1, max: 120, secs: 30 },
    { cat: 'AI_AUDIO', type: 'translate_audio', title: 'Audio Translation', desc: 'Whisper + NLLB', req: ['8GB RAM'], rate: 80_000_000, unit: 'minute', min: 1, max: 60, secs: 45 },
    { cat: 'AI_AUDIO', type: 'noise_remove', title: 'Noise Removal', desc: 'DeepFilterNet cleanup', req: ['CPU okay'], rate: 20_000_000, unit: 'minute', min: 1, max: 60, secs: 5 },
    // AI TEXT
    { cat: 'AI_TEXT', type: 'summarize', title: 'Document Summary', desc: 'LLM summarization', req: ['LLM access'], rate: 10_000_000, unit: 'page', min: 1, max: 100, secs: 5 },
    { cat: 'AI_TEXT', type: 'translate_text', title: 'Text Translation', desc: 'NLLB 200+ languages', req: ['4GB RAM'], rate: 1_000_000, unit: '1K chars', min: 1, max: 50, secs: 2 },
    { cat: 'AI_TEXT', type: 'ocr', title: 'OCR Extraction', desc: 'Tesseract image-to-text', req: ['Multi-lang'], rate: 5_000_000, unit: 'page', min: 1, max: 100, secs: 3 },
    // AI VIDEO
    { cat: 'AI_VIDEO', type: 'video_compress', title: 'Video Compression', desc: 'FFmpeg H.265', req: ['FFmpeg', 'GPU preferred'], rate: 100_000_000, unit: 'minute', min: 1, max: 30, secs: 20 },
    { cat: 'AI_VIDEO', type: 'video_thumbnail', title: 'Smart Thumbnails', desc: 'Key moment extraction', req: ['FFmpeg + CV'], rate: 10_000_000, unit: 'video', min: 1, max: 20, secs: 10 },
    // VERIFICATION
    { cat: 'VERIFICATION', type: 'merkle_verify', title: 'Merkle Verification', desc: 'Proof validation', req: ['Low latency'], rate: 20_000_000, unit: 'batch', min: 1, max: 100, secs: 1 },
    { cat: 'VERIFICATION', type: 'jury_duty', title: 'Jury Duty', desc: 'Dispute voting', req: ['1000+ PDOX staked'], rate: 500_000_000, unit: 'case', min: 1, max: 1, secs: 1500 },
    { cat: 'VERIFICATION', type: 'tx_validate', title: 'TX Validation', desc: 'Batch validation', req: ['RPC access'], rate: 5_000_000, unit: 'batch', min: 10, max: 1000, secs: 0.5 },
    // STORAGE
    { cat: 'STORAGE', type: 'encrypted_backup', title: 'Encrypted Backup', desc: 'Blob storage', req: ['Storage space'], rate: 100_000, unit: 'MB/day', min: 100, max: 10000, secs: 0.1 },
    // COMPUTE
    { cat: 'COMPUTE', type: 'cpu_benchmark', title: 'CPU Task', desc: 'Intensive compute', req: ['Multi-core'], rate: 5_000_000, unit: 'minute', min: 1, max: 60, secs: 60 },
    { cat: 'COMPUTE', type: 'ml_inference', title: 'ML Inference', desc: 'Model inference', req: ['GPU preferred'], rate: 50_000_000, unit: 'batch', min: 1, max: 100, secs: 10 },
];

// ============== QUEUES ==============
const pendingJobs = new Map<string, SimJob>();
const assignedJobs = new Map<string, SimJob>();
const completedJobs: SimJob[] = [];

// ============== SCORE TIERS ==============
const TIERS = [
    { min: 9900, name: 'ELITE', emoji: '👑', mult: 1.25 },
    { min: 9500, name: 'EXCELLENT', emoji: '⭐', mult: 1.15 },
    { min: 9000, name: 'GREAT', emoji: '✨', mult: 1.10 },
    { min: 8500, name: 'GOOD', emoji: '👍', mult: 1.05 },
    { min: 8000, name: 'AVERAGE', emoji: '➖', mult: 1.00 },
    { min: 7000, name: 'POOR', emoji: '⚠️', mult: 0.95 },
    { min: 6000, name: 'BAD', emoji: '❌', mult: 0.90 },
    { min: 5000, name: 'TERRIBLE', emoji: '🚫', mult: 0.80 },
    { min: 4000, name: 'CRITICAL', emoji: '💀', mult: 0.70 },
    { min: 3000, name: 'SUSPENDED', emoji: '🔒', mult: 0 },
    { min: 2000, name: 'BANNED', emoji: '⛔', mult: 0 },
    { min: 0, name: 'BLACKLIST', emoji: '☠️', mult: 0 },
];

function getTier(score: number) {
    return TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1];
}

// ============== AGENT SCORES (In-Memory) ==============
const agentScores = new Map<string, {
    wallet: string;
    score: number;
    tier: string;
    jobs: number;
    completed: number;
    failed: number;
    earned: bigint;
    streak: number;
    bestStreak: number;
}>();

// ============== LEDGER (In-Memory) ==============
const ledger: Array<{
    id: string;
    type: string;
    from?: string;
    to: string;
    amount: bigint;
    jobId?: string;
    agentId?: string;
    desc: string;
    time: Date;
    txSig?: string;
}> = [];

// ============== HELPERS ==============
const CLIENTS = ['Brain7x..Corp', 'Brain9k..Labs', 'Brain2m..Tech', 'BrainAI..Fund', 'BrainML..DAO'];

function genJobId() { return `JOB-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
function genLedgerId() { return `LED-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`; }

function createJob(tplIdx?: number): SimJob {
    const idx = tplIdx ?? Math.floor(Math.random() * TEMPLATES.length);
    const t = TEMPLATES[idx];
    const size = Math.floor(t.min + Math.random() * (t.max - t.min));
    const price = BigInt(Math.floor(t.rate * size));
    const secs = Math.floor(t.secs * size);

    const job: SimJob = {
        id: genJobId(),
        category: t.cat as JobCategory,
        type: t.type,
        title: t.title,
        desc: t.desc,
        requirements: t.req,
        priceLamports: price,
        estSecs: secs,
        input: { type: t.type, size: `${size} ${t.unit}`, format: 'auto' },
        status: 'PENDING',
        clientId: CLIENTS[Math.floor(Math.random() * CLIENTS.length)],
        createdAt: new Date(),
        deadline: new Date(Date.now() + secs * 2000),
    };
    pendingJobs.set(job.id, job);
    logger.info('Job created', { id: job.id, type: job.type, sol: Number(price) / LAMPORTS_PER_SOL });
    return job;
}

function assignJobToAgent(jobId: string, agentId: string, wallet: string): SimJob | null {
    const job = pendingJobs.get(jobId);
    if (!job) return null;
    job.status = 'ASSIGNED';
    job.agentId = agentId;
    job.agentWallet = wallet;
    job.assignedAt = new Date();
    pendingJobs.delete(jobId);
    assignedJobs.set(jobId, job);
    return job;
}

async function completeJobById(jobId: string, success: boolean, quality = 85): Promise<any> {
    const job = assignedJobs.get(jobId);
    if (!job || !job.agentId || !job.agentWallet) return null;

    const now = new Date();
    job.status = success ? 'COMPLETED' : 'FAILED';
    job.completedAt = now;
    job.quality = quality;
    job.onTime = now <= job.deadline;
    assignedJobs.delete(jobId);
    completedJobs.unshift(job);
    while (completedJobs.length > 1000) completedJobs.pop();

    // Get/create agent score
    let agent = agentScores.get(job.agentId);
    if (!agent) {
        agent = { wallet: job.agentWallet, score: 8000, tier: 'AVERAGE', jobs: 0, completed: 0, failed: 0, earned: 0n, streak: 0, bestStreak: 0 };
        agentScores.set(job.agentId, agent);
    }

    // Calculate score change
    let change = 0;
    if (success) {
        change = 10 + Math.floor(quality / 2);
        if (job.onTime) change += 20;
        if (agent.streak >= 3) change += Math.min(50, agent.streak * 5);
        change = Math.min(change, 150);
        agent.streak++;
        agent.bestStreak = Math.max(agent.bestStreak, agent.streak);
        agent.completed++;
    } else {
        change = agent.streak === 0 ? -150 : -100;
        agent.streak = 0;
        agent.failed++;
    }
    const oldScore = agent.score;
    const oldTier = getTier(oldScore);
    agent.score = Math.max(0, Math.min(10000, agent.score + change));
    const newTier = getTier(agent.score);
    agent.tier = newTier.name;
    agent.jobs++;

    // Calculate earnings (97% to agent)
    const earned = success ? (job.priceLamports * 97n) / 100n : 0n;
    agent.earned += earned;

    // Ledger entry
    if (success && earned > 0n) {
        const txSig = `devnet_${crypto.randomBytes(32).toString('hex')}`;
        ledger.push({
            id: genLedgerId(),
            type: 'JOB_PAYMENT',
            to: job.agentWallet,
            amount: earned,
            jobId: job.id,
            agentId: job.agentId,
            desc: `Payment: ${job.type} job ${job.id.slice(0, 12)}`,
            time: new Date(),
            txSig,
        });
        // Platform fee
        const fee = job.priceLamports - earned;
        ledger.push({
            id: genLedgerId(),
            type: 'FEE',
            from: job.agentWallet,
            to: 'PLATFORM_TREASURY',
            amount: fee,
            jobId: job.id,
            desc: `3% fee: ${job.id.slice(0, 12)}`,
            time: new Date(),
        });
    }

    logger.info('Job completed', {
        id: job.id, success, quality, onTime: job.onTime,
        earnedSOL: Number(earned) / LAMPORTS_PER_SOL,
        score: `${oldScore} → ${agent.score}`,
        tier: `${oldTier.name} → ${newTier.name}`,
    });

    return {
        job: { id: job.id, status: job.status, earnedSOL: Number(earned) / LAMPORTS_PER_SOL, quality, onTime: job.onTime },
        score: { old: oldScore, new: agent.score, change, oldTier: oldTier.name, newTier: newTier.name, tierChanged: oldTier.name !== newTier.name },
    };
}

// ============== SIMULATION ==============
let simInterval: NodeJS.Timeout | null = null;

function startSim(ms = 10000) {
    if (simInterval) return;
    simInterval = setInterval(() => {
        for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) createJob();
        for (const [id, job] of assignedJobs) {
            const elapsed = Date.now() - (job.assignedAt?.getTime() || Date.now());
            if (elapsed > job.estSecs * 500 && Math.random() < 0.8) {
                completeJobById(id, Math.random() < 0.92, 70 + Math.floor(Math.random() * 30)).catch(() => {});
            }
        }
    }, ms);
}

function stopSim() { if (simInterval) { clearInterval(simInterval); simInterval = null; } }

// ============== ROUTES ==============

router.get('/available', asyncHandler(async (req, res) => {
    const { category, limit = 20 } = req.query;
    let jobs = Array.from(pendingJobs.values());
    if (category) jobs = jobs.filter(j => j.category === category);
    res.json({
        count: jobs.length,
        jobs: jobs.slice(0, Number(limit)).map(j => ({
            id: j.id, category: j.category, type: j.type, title: j.title, desc: j.desc,
            requirements: j.requirements, priceSOL: Number(j.priceLamports) / LAMPORTS_PER_SOL,
            estDuration: j.estSecs + 's', input: j.input, client: j.clientId, deadline: j.deadline,
        })),
    });
}));

router.post('/claim', asyncHandler(async (req, res) => {
    const { jobId, agentId, agentWallet } = req.body;
    if (!jobId || !agentId || !agentWallet) return res.status(400).json({ error: 'Missing fields' });
    const job = assignJobToAgent(jobId, agentId, agentWallet);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ success: true, job: { id: job.id, type: job.type, priceSOL: Number(job.priceLamports) / LAMPORTS_PER_SOL, deadline: job.deadline } });
}));

router.post('/complete', asyncHandler(async (req, res) => {
    const { jobId, success, quality } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
    const result = await completeJobById(jobId, success !== false, quality || 85);
    if (!result) return res.status(404).json({ error: 'Job not found' });
    res.json({ success: true, ...result });
}));

router.get('/my-jobs', asyncHandler(async (req, res) => {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'Missing agentId' });
    res.json({
        assigned: Array.from(assignedJobs.values()).filter(j => j.agentId === agentId).map(j => ({ id: j.id, type: j.type, priceSOL: Number(j.priceLamports) / LAMPORTS_PER_SOL, deadline: j.deadline })),
        completed: completedJobs.filter(j => j.agentId === agentId).slice(0, 50).map(j => ({ id: j.id, type: j.type, status: j.status, earnedSOL: j.status === 'COMPLETED' ? Number((j.priceLamports * 97n) / 100n) / LAMPORTS_PER_SOL : 0, quality: j.quality })),
    });
}));

router.get('/templates', asyncHandler(async (req, res) => {
    res.json({ count: TEMPLATES.length, templates: TEMPLATES.map(t => ({ category: t.cat, type: t.type, title: t.title, desc: t.desc, requirements: t.req, rateSOL: t.rate / LAMPORTS_PER_SOL, unit: t.unit })) });
}));

router.get('/tiers', asyncHandler(async (req, res) => {
    res.json({ tiers: TIERS.map(t => ({ min: t.min, minPercent: t.min / 100, name: t.name, emoji: t.emoji, multiplier: t.mult })) });
}));

router.get('/agent/:agentId', asyncHandler(async (req, res) => {
    const agent = agentScores.get(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const tier = getTier(agent.score);
    res.json({
        agentId: req.params.agentId, wallet: agent.wallet,
        score: agent.score, scorePercent: agent.score / 100, tier: tier.name, emoji: tier.emoji, multiplier: tier.mult,
        jobs: agent.jobs, completed: agent.completed, failed: agent.failed,
        successRate: agent.jobs > 0 ? ((agent.completed / agent.jobs) * 100).toFixed(1) + '%' : 'N/A',
        earnedSOL: Number(agent.earned) / LAMPORTS_PER_SOL, streak: agent.streak, bestStreak: agent.bestStreak,
    });
}));

router.get('/leaderboard', asyncHandler(async (req, res) => {
    const sorted = Array.from(agentScores.entries()).sort((a, b) => b[1].score - a[1].score).slice(0, 50);
    res.json({
        count: sorted.length,
        leaderboard: sorted.map(([id, a], i) => {
            const tier = getTier(a.score);
            return { rank: i + 1, agentId: id, wallet: a.wallet.slice(0, 8) + '..', score: a.score, tier: tier.name, emoji: tier.emoji, earnedSOL: Number(a.earned) / LAMPORTS_PER_SOL, streak: a.streak };
        }),
    });
}));

router.get('/ledger', asyncHandler(async (req, res) => {
    const { limit = 50, type } = req.query;
    let entries = [...ledger].reverse();
    if (type) entries = entries.filter(e => e.type === type);
    res.json({
        count: entries.length,
        entries: entries.slice(0, Number(limit)).map(e => ({
            id: e.id, type: e.type, from: e.from, to: e.to, amountSOL: Number(e.amount) / LAMPORTS_PER_SOL,
            jobId: e.jobId, desc: e.desc, time: e.time, txSig: e.txSig?.slice(0, 16),
        })),
    });
}));

router.get('/stats', asyncHandler(async (req, res) => {
    const byType: Record<string, number> = {};
    let earned = 0n;
    completedJobs.forEach(j => { byType[j.type] = (byType[j.type] || 0) + 1; if (j.status === 'COMPLETED') earned += (j.priceLamports * 97n) / 100n; });
    const success = completedJobs.filter(j => j.status === 'COMPLETED').length;
    res.json({
        pending: pendingJobs.size, assigned: assignedJobs.size, completed: completedJobs.length,
        successRate: completedJobs.length > 0 ? ((success / completedJobs.length) * 100).toFixed(1) + '%' : 'N/A',
        totalEarnedSOL: Number(earned) / LAMPORTS_PER_SOL, byType, agents: agentScores.size,
    });
}));

router.post('/simulate', asyncHandler(async (req, res) => {
    const { count = 5 } = req.body;
    const jobs = [];
    for (let i = 0; i < Math.min(count, 20); i++) jobs.push(createJob());
    res.json({ success: true, created: jobs.length, jobs: jobs.map(j => ({ id: j.id, type: j.type, priceSOL: Number(j.priceLamports) / LAMPORTS_PER_SOL })) });
}));

router.post('/simulation/start', asyncHandler(async (req, res) => {
    startSim(req.body.intervalMs || 10000);
    res.json({ success: true, message: 'Simulation started' });
}));

router.post('/simulation/stop', asyncHandler(async (req, res) => {
    stopSim();
    res.json({ success: true, message: 'Simulation stopped' });
}));

export { createJob, assignJobToAgent, completeJobById, startSim, stopSim, TIERS, getTier };
export default router;

