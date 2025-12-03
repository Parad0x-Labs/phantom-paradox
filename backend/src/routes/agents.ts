import { Router } from 'express';
import { agentManager } from '../index';

const router = Router();

// GET /api/agents - List all agents
router.get('/', (req, res) => {
    const agents = agentManager.getAllAgents().map(a => ({
        id: a.id,
        walletAddress: a.walletAddress.slice(0, 8) + '...',
        platform: a.platform,
        capabilities: a.capabilities,
        status: a.status,
        reputation: a.reputation,
        metrics: a.metrics
    }));
    
    res.json({ agents });
});

// GET /api/agents/online - List online agents
router.get('/online', (req, res) => {
    const agents = agentManager.getOnlineAgents().map(a => ({
        id: a.id,
        walletAddress: a.walletAddress.slice(0, 8) + '...',
        platform: a.platform,
        capabilities: a.capabilities,
        status: a.status,
        reputation: a.reputation
    }));
    
    res.json({ agents, count: agents.length });
});

// GET /api/agents/available - List available agents
router.get('/available', (req, res) => {
    const capability = req.query.capability as string | undefined;
    const agents = agentManager.getAvailableAgents(capability).map(a => ({
        id: a.id,
        platform: a.platform,
        capabilities: a.capabilities,
        reputation: a.reputation,
        config: a.config
    }));
    
    res.json({ agents, count: agents.length });
});

// GET /api/agents/:id - Get agent details
router.get('/:id', (req, res) => {
    const agent = agentManager.getAgent(req.params.id);
    
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({
        id: agent.id,
        walletAddress: agent.walletAddress,
        platform: agent.platform,
        version: agent.version,
        capabilities: agent.capabilities,
        config: agent.config,
        metrics: agent.metrics,
        reputation: agent.reputation,
        status: agent.status,
        currentJob: agent.currentJob,
        lastHeartbeat: agent.lastHeartbeat,
        connectedAt: agent.connectedAt
    });
});

// GET /api/agents/wallet/:address - Get agent by wallet
router.get('/wallet/:address', (req, res) => {
    const agent = agentManager.getAgentByWallet(req.params.address);
    
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({
        id: agent.id,
        platform: agent.platform,
        capabilities: agent.capabilities,
        metrics: agent.metrics,
        reputation: agent.reputation,
        status: agent.status
    });
});

export default router;

