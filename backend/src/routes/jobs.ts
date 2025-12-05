import { Router } from 'express';
import { jobManager } from '../index';

const router = Router();

// POST /api/jobs - Create a new job
router.post('/', (req, res) => {
    const { type, brainsAddress, description, requirements, payment, deadline, autoApprove } = req.body;
    
    if (!type || !brainsAddress || !description || !payment) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        const job = jobManager.createJob({
            type,
            brainsAddress,
            description,
            requirements,
            payment,
            deadline,
            autoApprove
        });
        
        res.status(201).json({ job });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/jobs - List jobs
router.get('/', (req, res) => {
    const { status, type, brains, muscle } = req.query;
    
    let jobs = jobManager.getActiveJobs();
    
    // Filter by query params
    if (brains) {
        jobs = jobManager.getJobsByBrains(brains as string);
    } else if (muscle) {
        jobs = jobManager.getJobsByMuscle(muscle as string);
    }
    
    if (status) {
        jobs = jobs.filter(j => j.status === status);
    }
    
    if (type) {
        jobs = jobs.filter(j => j.type === type);
    }
    
    res.json({ 
        jobs: jobs.map(j => ({
            id: j.id,
            type: j.type,
            status: j.status,
            description: j.description,
            progress: j.progress,
            payment: j.payment,
            deadline: j.deadline,
            createdAt: j.createdAt
        })),
        count: jobs.length
    });
});

// GET /api/jobs/available - List jobs available for agents to claim
router.get('/available', (req, res) => {
    const jobs = jobManager.getPendingJobs();
    
    res.json({
        jobs: jobs.map(j => ({
            id: j.id,
            type: j.type,
            description: j.description,
            payment: {
                amount: j.payment.amount,
                currency: j.payment.currency,
                amountSOL: j.payment.amount / 1_000_000_000
            },
            deadline: j.deadline,
            createdAt: j.createdAt,
            requirements: j.requirements
        })),
        count: jobs.length
    });
});

// POST /api/jobs/:id/claim - Agent claims a job
router.post('/:id/claim', (req, res) => {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
        return res.status(400).json({ error: 'Missing walletAddress' });
    }
    
    const result = jobManager.claimJob(req.params.id, walletAddress);
    
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
        success: true, 
        job: result.job,
        message: 'Job claimed! Complete it within the deadline.'
    });
});

// POST /api/jobs/:id/complete - Agent marks job as complete
router.post('/:id/complete', async (req, res) => {
    const { walletAddress, proofHash, metrics } = req.body;
    
    if (!walletAddress) {
        return res.status(400).json({ error: 'Missing walletAddress' });
    }
    
    const result = await jobManager.completeJob(req.params.id, walletAddress, {
        proofHash,
        metrics,
        success: true
    });
    
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
        success: true,
        job: result.job,
        payment: result.payment,
        message: `Job completed! Payment of ${result.payment?.amountSOL} SOL sent.`
    });
});

// GET /api/jobs/:id - Get job details
router.get('/:id', (req, res) => {
    const job = jobManager.getJob(req.params.id);
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ job });
});

// POST /api/jobs/:id/approve - Approve completed job
router.post('/:id/approve', (req, res) => {
    const { brainsAddress } = req.body;
    
    if (!brainsAddress) {
        return res.status(400).json({ error: 'Missing brainsAddress' });
    }
    
    const success = jobManager.approveJob(req.params.id, brainsAddress);
    
    if (!success) {
        return res.status(400).json({ error: 'Cannot approve job' });
    }
    
    res.json({ success: true });
});

// POST /api/jobs/:id/reject - Reject and dispute
router.post('/:id/reject', (req, res) => {
    const { brainsAddress, reason } = req.body;
    
    if (!brainsAddress || !reason) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const success = jobManager.rejectJob(req.params.id, brainsAddress, reason);
    
    if (!success) {
        return res.status(400).json({ error: 'Cannot reject job' });
    }
    
    res.json({ success: true, message: 'Dispute opened' });
});

// POST /api/jobs/:id/cancel - Cancel pending job
router.post('/:id/cancel', (req, res) => {
    const { brainsAddress } = req.body;
    
    if (!brainsAddress) {
        return res.status(400).json({ error: 'Missing brainsAddress' });
    }
    
    const success = jobManager.cancelJob(req.params.id, brainsAddress);
    
    if (!success) {
        return res.status(400).json({ error: 'Cannot cancel job (only pending jobs can be cancelled)' });
    }
    
    res.json({ success: true });
});

export default router;

