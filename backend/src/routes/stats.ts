import { Router } from 'express';
import { agentManager, jobManager, disputeManager } from '../index';

const router = Router();

// GET /api/stats - Get overall system stats
router.get('/', (req, res) => {
    res.json({
        agents: agentManager.getStats(),
        jobs: jobManager.getStats(),
        disputes: disputeManager.getStats(),
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '0.1.0'
        }
    });
});

// GET /api/stats/agents - Agent stats only
router.get('/agents', (req, res) => {
    res.json(agentManager.getStats());
});

// GET /api/stats/jobs - Job stats only
router.get('/jobs', (req, res) => {
    res.json(jobManager.getStats());
});

// GET /api/stats/disputes - Dispute stats only
router.get('/disputes', (req, res) => {
    res.json(disputeManager.getStats());
});

// GET /api/stats/live - Live dashboard data
router.get('/live', (req, res) => {
    const agentStats = agentManager.getStats();
    const jobStats = jobManager.getStats();
    
    res.json({
        timestamp: Date.now(),
        agents: {
            online: agentStats.online,
            busy: agentStats.busy,
            available: agentStats.available
        },
        jobs: {
            pending: jobStats.pending,
            active: jobStats.assigned + jobStats.inProgress,
            completed: jobStats.completed
        },
        throughput: {
            totalBytes: agentStats.totalBytesRelayed,
            totalPayments: jobStats.totalPayments
        }
    });
});

export default router;

