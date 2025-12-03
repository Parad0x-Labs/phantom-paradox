/**
 * AGENT MANAGER
 * 
 * Tracks online agents, their capabilities, and status.
 * Handles heartbeats and agent lifecycle.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export interface Agent {
    id: string;
    walletAddress: string;
    platform: string;
    version: string;
    capabilities: string[];
    config: {
        maxBandwidth: number;
        dailyDataCap: number;
    };
    metrics: {
        bytesRelayed: number;
        bytesToday: number;
        connections: number;
        uptime: number;
    };
    reputation: number;
    status: 'online' | 'busy' | 'offline';
    currentJob: string | null;
    lastHeartbeat: number;
    connectedAt: number;
    ws?: any; // WebSocket connection
}

export class AgentManager {
    private agents: Map<string, Agent> = new Map();
    private walletToAgent: Map<string, string> = new Map();
    
    private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds
    private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
    
    constructor() {
        logger.info('AgentManager initialized');
    }
    
    // ============== HEARTBEAT ==============
    
    handleHeartbeat(message: any, ws: any): void {
        const { agent: walletAddress, platform, version, capabilities, config, metrics } = message;
        
        if (!walletAddress) {
            ws.send(JSON.stringify({ error: 'Missing agent wallet address' }));
            return;
        }
        
        let agentId = this.walletToAgent.get(walletAddress);
        
        if (!agentId) {
            // New agent
            agentId = uuidv4();
            this.walletToAgent.set(walletAddress, agentId);
            
            const agent: Agent = {
                id: agentId,
                walletAddress,
                platform: platform || 'unknown',
                version: version || '0.0.0',
                capabilities: capabilities || ['relay'],
                config: config || { maxBandwidth: 10, dailyDataCap: 1000 },
                metrics: metrics || { bytesRelayed: 0, bytesToday: 0, connections: 0, uptime: 0 },
                reputation: 100,
                status: 'online',
                currentJob: null,
                lastHeartbeat: Date.now(),
                connectedAt: Date.now(),
                ws
            };
            
            this.agents.set(agentId, agent);
            logger.info('New agent registered', { agentId, walletAddress, platform });
            
        } else {
            // Existing agent - update
            const agent = this.agents.get(agentId);
            if (agent) {
                agent.lastHeartbeat = Date.now();
                agent.metrics = metrics || agent.metrics;
                agent.config = config || agent.config;
                agent.status = agent.currentJob ? 'busy' : 'online';
                agent.ws = ws;
            }
        }
        
        // Send acknowledgment
        ws.send(JSON.stringify({
            type: 'heartbeat_ack',
            agentId,
            serverTime: Date.now()
        }));
    }
    
    // ============== QUERIES ==============
    
    getAgent(agentId: string): Agent | undefined {
        return this.agents.get(agentId);
    }
    
    getAgentByWallet(walletAddress: string): Agent | undefined {
        const agentId = this.walletToAgent.get(walletAddress);
        return agentId ? this.agents.get(agentId) : undefined;
    }
    
    getOnlineAgents(): Agent[] {
        return Array.from(this.agents.values()).filter(a => a.status !== 'offline');
    }
    
    getAvailableAgents(capability?: string): Agent[] {
        return this.getOnlineAgents().filter(agent => {
            if (agent.status === 'busy') return false;
            if (capability && !agent.capabilities.includes(capability)) return false;
            return true;
        });
    }
    
    getOnlineCount(): number {
        return this.getOnlineAgents().length;
    }
    
    getAllAgents(): Agent[] {
        return Array.from(this.agents.values());
    }
    
    // ============== STATUS ==============
    
    setAgentBusy(agentId: string, jobId: string): boolean {
        const agent = this.agents.get(agentId);
        if (agent && agent.status === 'online') {
            agent.status = 'busy';
            agent.currentJob = jobId;
            return true;
        }
        return false;
    }
    
    setAgentAvailable(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = 'online';
            agent.currentJob = null;
        }
    }
    
    updateReputation(agentId: string, delta: number): void {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.reputation = Math.max(0, Math.min(100, agent.reputation + delta));
            logger.info('Reputation updated', { agentId, newReputation: agent.reputation });
        }
    }
    
    // ============== MESSAGING ==============
    
    sendToAgent(agentId: string, message: any): boolean {
        const agent = this.agents.get(agentId);
        if (agent && agent.ws && agent.ws.readyState === 1) {
            agent.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
    
    broadcastToAgents(message: any, filter?: (agent: Agent) => boolean): number {
        let sent = 0;
        for (const agent of this.agents.values()) {
            if (filter && !filter(agent)) continue;
            if (this.sendToAgent(agent.id, message)) {
                sent++;
            }
        }
        return sent;
    }
    
    // ============== CLEANUP ==============
    
    startCleanupTask(): void {
        setInterval(() => this.cleanupOfflineAgents(), this.CLEANUP_INTERVAL);
        logger.info('Agent cleanup task started');
    }
    
    private cleanupOfflineAgents(): void {
        const now = Date.now();
        let removed = 0;
        
        for (const [agentId, agent] of this.agents.entries()) {
            if (now - agent.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
                agent.status = 'offline';
                
                // If agent has been offline for 5+ minutes, remove
                if (now - agent.lastHeartbeat > 300000) {
                    this.agents.delete(agentId);
                    this.walletToAgent.delete(agent.walletAddress);
                    removed++;
                }
            }
        }
        
        if (removed > 0) {
            logger.info('Cleaned up offline agents', { removed });
        }
    }
    
    // ============== STATS ==============
    
    getStats(): any {
        const agents = this.getAllAgents();
        const online = agents.filter(a => a.status !== 'offline');
        const busy = agents.filter(a => a.status === 'busy');
        
        return {
            total: agents.length,
            online: online.length,
            busy: busy.length,
            available: online.length - busy.length,
            byPlatform: this.countByField(agents, 'platform'),
            byCapability: this.countCapabilities(agents),
            totalBytesRelayed: agents.reduce((sum, a) => sum + a.metrics.bytesRelayed, 0),
            averageReputation: agents.length > 0 
                ? agents.reduce((sum, a) => sum + a.reputation, 0) / agents.length 
                : 0
        };
    }
    
    private countByField(agents: Agent[], field: keyof Agent): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const agent of agents) {
            const value = String(agent[field]);
            counts[value] = (counts[value] || 0) + 1;
        }
        return counts;
    }
    
    private countCapabilities(agents: Agent[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const agent of agents) {
            for (const cap of agent.capabilities) {
                counts[cap] = (counts[cap] || 0) + 1;
            }
        }
        return counts;
    }
}

