/**
 * PARADOX JOBS API
 * 
 * Real job types with actual use cases:
 * - Photo Enhancement (Real-ESRGAN)
 * - Background Removal (U2Net)
 * - Transcription (Whisper)
 * - Translation (NLLB)
 * - Video Compression (FFmpeg)
 * - OCR (Tesseract)
 * - And more...
 * 
 * NO user IPs stored - only job metadata
 */

import { Router } from "express";
import { logger } from "../shared/logger";
import { asyncHandler } from "./middleware";
import { query } from "../shared/db";
import crypto from "crypto";

const router = Router();

// ============== TYPES ==============

export type JobType = 
    | 'relay' | 'geo_unlock'           // Relay jobs
    | 'photo_enhance' | 'bg_remove'    // Image AI
    | 'transcribe' | 'translate'       // Audio/Text AI
    | 'summarize' | 'video_compress'   // Document/Video
    | 'ocr' | 'render_3d'              // OCR/3D
    | 'verify_proof' | 'jury_duty'     // Verification
    | 'backup';                        // Storage

export type JobStatus = 'pending' | 'assigned' | 'running' | 'complete' | 'failed' | 'disputed';

export interface Job {
    id: string;
    type: JobType;
    status: JobStatus;
    // Client info (anonymized - NO IP)
    clientId: string;           // Hashed wallet address
    // Agent info
    agentId?: string;
    agentAddress?: string;
    // Job details
    input: {
        size?: string;          // e.g., "2.4 MB", "5 min audio"
        format?: string;        // e.g., "jpg", "mp3", "mp4"
        params?: Record<string, any>;
    };
    output?: {
        result?: string;        // e.g., "4x upscaled", "transcribed"
        size?: string;
        format?: string;
        hash?: string;          // Output file hash for verification
    };
    // Pricing
    cost: number;               // USD
    agentEarned?: number;       // Agent's share (97%)
    // Timing
    createdAt: number;
    assignedAt?: number;
    completedAt?: number;
    duration?: number;          // Seconds
    // Quality
    rating?: number;            // 1-5 stars
}

// ============== JOB PRICING ==============

const JOB_PRICING: Record<JobType, { rate: number; unit: string }> = {
    relay: { rate: 0.001, unit: 'MB' },
    geo_unlock: { rate: 0.002, unit: 'MB' },
    photo_enhance: { rate: 0.02, unit: 'image' },
    bg_remove: { rate: 0.01, unit: 'image' },
    transcribe: { rate: 0.05, unit: 'minute' },
    translate: { rate: 0.001, unit: '1K chars' },
    summarize: { rate: 0.01, unit: 'page' },
    video_compress: { rate: 0.10, unit: 'minute' },
    ocr: { rate: 0.005, unit: 'page' },
    render_3d: { rate: 0.50, unit: 'frame' },
    verify_proof: { rate: 0.02, unit: 'batch' },
    jury_duty: { rate: 0.50, unit: 'case' },
    backup: { rate: 0.0001, unit: 'MB/day' },
};

// ============== IN-MEMORY JOB STORE ==============

const activeJobs = new Map<string, Job>();
const completedJobs: Job[] = [];
let totalEarned = 0;
let totalCompleted = 0;

// ============== ROUTES ==============

/**
 * GET /api/jobs/catalog
 * Get all available job types and pricing
 */
router.get('/catalog', asyncHandler(async (req, res) => {
    const catalog = Object.entries(JOB_PRICING).map(([type, pricing]) => ({
        type,
        ...pricing,
        available: true,
    }));
    
    res.json({ jobs: catalog });
}));

/**
 * GET /api/jobs/active
 * Get currently active jobs (for dashboard)
 */
router.get('/active', asyncHandler(async (req, res) => {
    const jobs = Array.from(activeJobs.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map(sanitizeJob);
    
    res.json({
        count: jobs.length,
        jobs,
    });
}));

/**
 * GET /api/jobs/completed
 * Get completed jobs (last 24h)
 */
router.get('/completed', asyncHandler(async (req, res) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = completedJobs
        .filter(j => j.completedAt && j.completedAt > cutoff)
        .slice(0, 50)
        .map(sanitizeJob);
    
    res.json({
        count: recent.length,
        totalCompleted,
        totalEarned: totalEarned.toFixed(2),
        jobs: recent,
    });
}));

/**
 * GET /api/jobs/stats
 * Get job statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const byType: Record<string, number> = {};
    completedJobs.forEach(j => {
        byType[j.type] = (byType[j.type] || 0) + 1;
    });
    
    res.json({
        active: activeJobs.size,
        completedToday: totalCompleted,
        totalEarned: totalEarned.toFixed(2),
        byType,
        avgDuration: completedJobs.length > 0 
            ? completedJobs.reduce((a, j) => a + (j.duration || 0), 0) / completedJobs.length 
            : 0,
    });
}));

/**
 * POST /api/jobs/submit
 * Submit a new job (internal or client-facing)
 */
router.post('/submit', asyncHandler(async (req, res) => {
    const { type, input, clientWallet } = req.body;
    
    if (!type || !JOB_PRICING[type as JobType]) {
        return res.status(400).json({
            error: 'invalid_job_type',
            message: `Unknown job type: ${type}`,
        });
    }
    
    const jobId = crypto.randomBytes(16).toString('hex');
    const pricing = JOB_PRICING[type as JobType];
    
    // Calculate cost based on input size
    let quantity = 1;
    if (input?.size) {
        const match = input.size.match(/(\d+\.?\d*)/);
        if (match) quantity = parseFloat(match[1]);
    }
    const cost = pricing.rate * quantity;
    
    const job: Job = {
        id: jobId,
        type: type as JobType,
        status: 'pending',
        clientId: clientWallet ? hashWallet(clientWallet) : 'anonymous',
        input: input || {},
        cost,
        createdAt: Date.now(),
    };
    
    activeJobs.set(jobId, job);
    
    logger.info('Job submitted', { jobId, type, cost });
    
    res.json({
        success: true,
        jobId,
        estimatedCost: cost,
        status: 'pending',
    });
}));

/**
 * POST /api/jobs/:id/assign
 * Assign job to an agent (internal)
 */
router.post('/:id/assign', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { agentId, agentAddress } = req.body;
    
    const job = activeJobs.get(id);
    if (!job) {
        return res.status(404).json({ error: 'job_not_found' });
    }
    
    job.status = 'assigned';
    job.agentId = agentId;
    job.agentAddress = agentAddress;
    job.assignedAt = Date.now();
    
    logger.info('Job assigned', { jobId: id, agentId });
    
    res.json({ success: true, job: sanitizeJob(job) });
}));

/**
 * POST /api/jobs/:id/complete
 * Mark job as complete with output
 */
router.post('/:id/complete', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { output, success } = req.body;
    
    const job = activeJobs.get(id);
    if (!job) {
        return res.status(404).json({ error: 'job_not_found' });
    }
    
    job.status = success ? 'complete' : 'failed';
    job.completedAt = Date.now();
    job.duration = Math.floor((job.completedAt - job.createdAt) / 1000);
    job.output = output;
    job.agentEarned = job.cost * 0.97; // Agent gets 97%
    
    // Move to completed
    activeJobs.delete(id);
    completedJobs.unshift(job);
    
    if (success) {
        totalCompleted++;
        totalEarned += job.agentEarned;
    }
    
    // Keep only last 1000 completed
    while (completedJobs.length > 1000) {
        completedJobs.pop();
    }
    
    logger.info('Job completed', { jobId: id, success, duration: job.duration });
    
    res.json({ success: true, job: sanitizeJob(job) });
}));

/**
 * GET /api/jobs/:id
 * Get job details
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    let job = activeJobs.get(id);
    if (!job) {
        job = completedJobs.find(j => j.id === id);
    }
    
    if (!job) {
        return res.status(404).json({ error: 'job_not_found' });
    }
    
    res.json(sanitizeJob(job));
}));

// ============== HELPERS ==============

function hashWallet(wallet: string): string {
    return crypto.createHash('sha256').update(wallet).digest('hex').substr(0, 16);
}

function sanitizeJob(job: Job): Partial<Job> {
    // Remove sensitive data, keep only what's needed for display
    return {
        id: job.id,
        type: job.type,
        status: job.status,
        input: {
            size: job.input.size,
            format: job.input.format,
        },
        output: job.output ? {
            result: job.output.result,
            size: job.output.size,
        } : undefined,
        cost: job.cost,
        agentEarned: job.agentEarned,
        duration: job.duration,
        agent: job.agentAddress?.substr(0, 8),
        createdAt: job.createdAt,
        completedAt: job.completedAt,
    };
}

export default router;

