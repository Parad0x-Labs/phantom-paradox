import { Router } from 'express';
import { disputeManager, jobManager } from '../index';

const router = Router();

// POST /api/disputes - Open a new dispute
router.post('/', (req, res) => {
    const { jobId, opener, reason, category } = req.body;
    
    if (!jobId || !opener || !reason || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const job = jobManager.getJob(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    if (!job.muscleAddress) {
        return res.status(400).json({ error: 'Job has no assigned agent' });
    }
    
    try {
        const dispute = disputeManager.openDispute({
            jobId,
            brainsAddress: job.brainsAddress,
            muscleAddress: job.muscleAddress,
            opener,
            reason,
            category
        });
        
        res.status(201).json({ dispute });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/disputes - List disputes
router.get('/', (req, res) => {
    const { status, party } = req.query;
    
    let disputes = disputeManager.getActiveDisputes();
    
    if (party) {
        disputes = disputeManager.getDisputesByParty(party as string);
    }
    
    if (status) {
        disputes = disputes.filter(d => d.status === status);
    }
    
    res.json({
        disputes: disputes.map(d => ({
            id: d.id,
            jobId: d.jobId,
            status: d.status,
            category: d.category,
            opener: d.opener,
            createdAt: d.createdAt,
            juryCount: d.jury.filter(j => j.acceptedAt).length,
            votesCount: d.jury.filter(j => j.vote).length
        })),
        count: disputes.length
    });
});

// GET /api/disputes/:id - Get dispute details
router.get('/:id', (req, res) => {
    const dispute = disputeManager.getDispute(req.params.id);
    
    if (!dispute) {
        return res.status(404).json({ error: 'Dispute not found' });
    }
    
    // Hide sensitive jury info if still voting
    const juryInfo = dispute.status === 'resolved'
        ? dispute.jury
        : dispute.jury.map(j => ({
            accepted: !!j.acceptedAt,
            voted: !!j.vote
        }));
    
    res.json({
        id: dispute.id,
        jobId: dispute.jobId,
        status: dispute.status,
        category: dispute.category,
        reason: dispute.reason,
        opener: dispute.opener,
        brainsAddress: dispute.brainsAddress,
        muscleAddress: dispute.muscleAddress,
        evidence: dispute.evidence,
        jury: juryInfo,
        jurySize: dispute.jurySize,
        consensusRequired: dispute.consensusRequired,
        createdAt: dispute.createdAt,
        juryDeadline: dispute.juryDeadline,
        votingDeadline: dispute.votingDeadline,
        verdict: dispute.verdict,
        voteBreakdown: dispute.voteBreakdown,
        resolvedAt: dispute.resolvedAt
    });
});

// POST /api/disputes/:id/evidence - Submit evidence
router.post('/:id/evidence', (req, res) => {
    const { submitter, type, title, description, dataHash, arweaveUrl } = req.body;
    
    if (!submitter || !type || !title || !dataHash) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const evidence = disputeManager.submitEvidence(req.params.id, {
        submitter,
        type,
        title,
        description: description || '',
        dataHash,
        arweaveUrl
    });
    
    if (!evidence) {
        return res.status(400).json({ error: 'Cannot submit evidence' });
    }
    
    res.status(201).json({ evidence });
});

// POST /api/disputes/:id/jury/accept - Accept jury duty
router.post('/:id/jury/accept', (req, res) => {
    const { agentId } = req.body;
    
    if (!agentId) {
        return res.status(400).json({ error: 'Missing agentId' });
    }
    
    const success = disputeManager.acceptJuryInvite(req.params.id, agentId);
    
    if (!success) {
        return res.status(400).json({ error: 'Cannot accept jury invite' });
    }
    
    res.json({ success: true });
});

// POST /api/disputes/:id/vote - Submit jury vote
router.post('/:id/vote', (req, res) => {
    const { agentId, vote, confidence } = req.body;
    
    if (!agentId || !vote) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const validVotes = ['brains_win', 'muscle_win', 'split'];
    if (!validVotes.includes(vote)) {
        return res.status(400).json({ error: 'Invalid vote' });
    }
    
    const success = disputeManager.submitVote(req.params.id, agentId, vote, confidence || 5);
    
    if (!success) {
        return res.status(400).json({ error: 'Cannot submit vote' });
    }
    
    res.json({ success: true });
});

// GET /api/disputes/jury/:agentId - Get pending jury duties
router.get('/jury/:agentId', (req, res) => {
    const disputes = disputeManager.getPendingJuryDuties(req.params.agentId);
    
    res.json({
        duties: disputes.map(d => ({
            disputeId: d.id,
            jobId: d.jobId,
            category: d.category,
            votingDeadline: d.votingDeadline
        })),
        count: disputes.length
    });
});

export default router;

