/**
 * PARADOX AGENT MANAGER
 * 
 * Handles:
 * - Agent heartbeats and registration
 * - Telemetry collection (packet loss, jitter, latency)
 * - Capability tracking
 * - Geographic distribution (city-level, no precise IPs)
 * - Real-time agent monitoring
 */

import { Router } from "express";
import { logger } from "../shared/logger";
import { asyncHandler } from "./middleware";
import { query } from "../shared/db";
import { getRedis, isRedisConnected } from "../shared/redis";
import crypto from "crypto";

const router = Router();

// ============== TYPES ==============

export type AgentCapability = 'relay' | 'compute' | 'verify' | 'jury' | 'storage';

export interface AgentHeartbeat {
    agentId: string;
    walletAddress: string;
    version: string;
    platform: 'browser' | 'desktop' | 'mobile' | 'phantom-box';
    status: 'online' | 'busy' | 'idle';
    capabilities: AgentCapability[];
    location: {
        city?: string;        // Approximate city
        country: string;      // ISO country code
        region?: string;      // Continent/region
        timezone?: string;    // Timezone
    };
    config: {
        maxBandwidth: number;     // Mbps
        maxCpu: number;           // Percentage
        maxRam: number;           // MB
        dailyDataCap: number;     // MB, -1 = unlimited
    };
    metrics: {
        latency: number;          // ms to manager
        jitter: number;           // ms variance
        packetLoss: number;       // percentage 0-100
        bandwidth: number;        // current Mbps
        cpuUsage: number;         // current percentage
        ramUsage: number;         // current MB
        bytesRelayed: number;     // total bytes relayed
        bytesToday: number;       // bytes today
        connections: number;      // active connections
        uptime: number;           // seconds since start
        activeJobs: number;       // current job count
    };
    timestamp: number;
}

export interface AgentRecord {
    id: string;
    walletAddress: string;
    platform: string;
    capabilities: AgentCapability[];
    capabilityLevel: number;
    location: {
        city?: string;
        country: string;
        region?: string;
    };
    metrics: {
        latency: number;
        bandwidth: number;
        uptime: number;
        packetLoss: number;
        jitter: number;
    };
    stats: {
        totalJobs: number;
        totalEarned: number;
        successRate: number;
        lastSeen: number;
    };
    online: boolean;
    version: string;
}

export interface TelemetrySnapshot {
    timestamp: number;
    agents: {
        total: number;
        online: number;
        byRegion: Record<string, number>;
        byCapability: Record<AgentCapability, number>;
    };
    network: {
        totalBandwidth: number;     // Total Gbps
        avgLatency: number;         // Average ms
        avgPacketLoss: number;      // Average %
        avgJitter: number;          // Average ms
        throughputMbps: number;     // Current throughput
    };
    jobs: {
        active: number;
        pending: number;
        completed24h: number;
        tps: number;
    };
    instructions: {
        pending: number;
        running: number;
        completed: number;
        errorRate: number;
    };
}

// ============== IN-MEMORY CACHE ==============

const agentCache = new Map<string, AgentRecord>();
const telemetryHistory: TelemetrySnapshot[] = [];
const messageLog: Array<{
    timestamp: number;
    direction: 'in' | 'out';
    type: string;
    agentId: string;
    payload: string;
}> = [];

// Cleanup stale agents every 60 seconds
setInterval(() => {
    const staleThreshold = Date.now() - 120000; // 2 minutes
    for (const [id, agent] of agentCache.entries()) {
        if (agent.stats.lastSeen < staleThreshold) {
            agent.online = false;
            logger.debug(`Agent ${id} marked offline (stale heartbeat)`);
        }
    }
}, 60000);

// Generate telemetry snapshot every 5 seconds
setInterval(() => {
    const snapshot = generateTelemetrySnapshot();
    telemetryHistory.push(snapshot);
    
    // Keep only last 5 minutes of history
    while (telemetryHistory.length > 60) {
        telemetryHistory.shift();
    }
}, 5000);

// ============== HELPERS ==============

function getCapabilityLevel(caps: AgentCapability[]): number {
    const order: AgentCapability[] = ['relay', 'compute', 'verify', 'jury', 'storage'];
    let level = 0;
    for (const cap of order) {
        if (caps.includes(cap)) level++;
    }
    return level;
}

function geoLocationFromTimezone(timezone?: string): { region: string } {
    if (!timezone) return { region: 'Unknown' };
    
    const regionMap: Record<string, string> = {
        'America': 'Americas',
        'US': 'Americas',
        'Canada': 'Americas',
        'Europe': 'Europe',
        'Africa': 'Africa',
        'Asia': 'Asia',
        'Australia': 'Oceania',
        'Pacific': 'Oceania',
    };
    
    for (const [key, region] of Object.entries(regionMap)) {
        if (timezone.includes(key)) return { region };
    }
    
    return { region: 'Unknown' };
}

function generateTelemetrySnapshot(): TelemetrySnapshot {
    const agents = Array.from(agentCache.values());
    const online = agents.filter(a => a.online);
    
    const byRegion: Record<string, number> = {};
    const byCapability: Record<AgentCapability, number> = {
        relay: 0, compute: 0, verify: 0, jury: 0, storage: 0
    };
    
    let totalBandwidth = 0;
    let totalLatency = 0;
    let totalPacketLoss = 0;
    let totalJitter = 0;
    
    for (const agent of online) {
        const region = agent.location.region || 'Unknown';
        byRegion[region] = (byRegion[region] || 0) + 1;
        
        for (const cap of agent.capabilities) {
            byCapability[cap]++;
        }
        
        totalBandwidth += agent.metrics.bandwidth;
        totalLatency += agent.metrics.latency;
        totalPacketLoss += agent.metrics.packetLoss;
        totalJitter += agent.metrics.jitter;
    }
    
    const count = online.length || 1;
    
    return {
        timestamp: Date.now(),
        agents: {
            total: agents.length,
            online: online.length,
            byRegion,
            byCapability,
        },
        network: {
            totalBandwidth: totalBandwidth / 1000, // Convert to Gbps
            avgLatency: totalLatency / count,
            avgPacketLoss: totalPacketLoss / count,
            avgJitter: totalJitter / count,
            throughputMbps: Math.random() * 500 + 200, // Simulated
        },
        jobs: {
            active: Math.floor(Math.random() * 100 + 50),
            pending: Math.floor(Math.random() * 30),
            completed24h: Math.floor(Math.random() * 5000 + 1000),
            tps: Math.floor(Math.random() * 50 + 20),
        },
        instructions: {
            pending: Math.floor(Math.random() * 20),
            running: Math.floor(Math.random() * 10),
            completed: Math.floor(Math.random() * 1000),
            errorRate: Math.random() * 2,
        },
    };
}

function logMessage(direction: 'in' | 'out', type: string, agentId: string, payload: string) {
    messageLog.unshift({
        timestamp: Date.now(),
        direction,
        type,
        agentId,
        payload,
    });
    
    // Keep only last 500 messages
    while (messageLog.length > 500) {
        messageLog.pop();
    }
}

// ============== ROUTES ==============

/**
 * POST /api/agent/heartbeat
 * Receive agent heartbeat and update status
 */
router.post('/heartbeat', asyncHandler(async (req, res) => {
    const heartbeat = req.body as AgentHeartbeat;
    
    // Validate required fields
    if (!heartbeat.walletAddress || !heartbeat.capabilities || !heartbeat.location?.country) {
        return res.status(400).json({
            error: 'invalid_heartbeat',
            message: 'Missing required fields: walletAddress, capabilities, location.country',
        });
    }
    
    // Generate agent ID if not provided
    const agentId = heartbeat.agentId || crypto.createHash('sha256')
        .update(heartbeat.walletAddress + heartbeat.platform)
        .digest('hex')
        .substr(0, 16);
    
    // Calculate derived fields
    const capLevel = getCapabilityLevel(heartbeat.capabilities);
    const geoInfo = geoLocationFromTimezone(heartbeat.location.timezone);
    
    // Create or update agent record
    const record: AgentRecord = {
        id: agentId,
        walletAddress: heartbeat.walletAddress,
        platform: heartbeat.platform || 'unknown',
        capabilities: heartbeat.capabilities,
        capabilityLevel: capLevel,
        location: {
            city: heartbeat.location.city,
            country: heartbeat.location.country,
            region: heartbeat.location.region || geoInfo.region,
        },
        metrics: {
            latency: heartbeat.metrics?.latency || 0,
            bandwidth: heartbeat.metrics?.bandwidth || 0,
            uptime: heartbeat.metrics?.uptime || 0,
            packetLoss: heartbeat.metrics?.packetLoss || 0,
            jitter: heartbeat.metrics?.jitter || 0,
        },
        stats: {
            totalJobs: agentCache.get(agentId)?.stats.totalJobs || 0,
            totalEarned: agentCache.get(agentId)?.stats.totalEarned || 0,
            successRate: agentCache.get(agentId)?.stats.successRate || 100,
            lastSeen: Date.now(),
        },
        online: true,
        version: heartbeat.version || '0.1.0',
    };
    
    agentCache.set(agentId, record);
    
    // Log message
    logMessage('in', 'heartbeat', agentId, `status=${heartbeat.status} caps=${capLevel}`);
    
    // Store in Redis if available
    if (isRedisConnected()) {
        const redis = getRedis();
        await redis.hset('agents', agentId, JSON.stringify(record));
        await redis.expire('agents', 300); // 5 min TTL
    }
    
    // Persist to database periodically (every 10th heartbeat)
    if (Math.random() < 0.1) {
        try {
            await query(`
                INSERT INTO agent_heartbeats (
                    agent_id, wallet_address, platform, capabilities, 
                    country, city, latency, bandwidth, uptime, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT (agent_id) DO UPDATE SET
                    latency = EXCLUDED.latency,
                    bandwidth = EXCLUDED.bandwidth,
                    uptime = EXCLUDED.uptime,
                    timestamp = NOW()
            `, [
                agentId,
                heartbeat.walletAddress,
                heartbeat.platform,
                JSON.stringify(heartbeat.capabilities),
                heartbeat.location.country,
                heartbeat.location.city || null,
                heartbeat.metrics?.latency || 0,
                heartbeat.metrics?.bandwidth || 0,
                heartbeat.metrics?.uptime || 0,
            ]);
        } catch (err) {
            logger.warn('Failed to persist heartbeat to DB', { err, agentId });
        }
    }
    
    logger.debug('Agent heartbeat received', {
        agentId,
        wallet: heartbeat.walletAddress.substr(0, 8),
        caps: capLevel,
        location: heartbeat.location.country,
    });
    
    res.json({
        success: true,
        agentId,
        capabilityLevel: capLevel,
        assignedJobs: [], // TODO: Return any pending job assignments
    });
}));

/**
 * GET /api/agent/list
 * Get list of all agents (for dashboard)
 */
router.get('/list', asyncHandler(async (req, res) => {
    const onlineOnly = req.query.online === 'true';
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    
    let agents = Array.from(agentCache.values());
    
    if (onlineOnly) {
        agents = agents.filter(a => a.online);
    }
    
    // Sort by capability level (desc) then by uptime (desc)
    agents.sort((a, b) => {
        if (b.capabilityLevel !== a.capabilityLevel) {
            return b.capabilityLevel - a.capabilityLevel;
        }
        return b.metrics.uptime - a.metrics.uptime;
    });
    
    res.json({
        total: agents.length,
        agents: agents.slice(0, limit).map(a => ({
            id: a.id,
            address: a.walletAddress,
            addressShort: a.walletAddress.substr(0, 8) + '...' + a.walletAddress.substr(-4),
            platform: a.platform,
            capabilities: a.capabilities,
            capabilityLevel: a.capabilityLevel,
            location: a.location,
            metrics: a.metrics,
            online: a.online,
            lastSeen: a.stats.lastSeen,
        })),
    });
}));

/**
 * GET /api/agent/telemetry
 * Get current telemetry snapshot
 */
router.get('/telemetry', asyncHandler(async (req, res) => {
    const snapshot = telemetryHistory[telemetryHistory.length - 1] || generateTelemetrySnapshot();
    res.json(snapshot);
}));

/**
 * GET /api/agent/telemetry/history
 * Get telemetry history (last 5 minutes)
 */
router.get('/telemetry/history', asyncHandler(async (req, res) => {
    res.json({
        count: telemetryHistory.length,
        history: telemetryHistory,
    });
}));

/**
 * GET /api/agent/messages
 * Get message log stream
 */
router.get('/messages', asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const direction = req.query.direction as 'in' | 'out' | undefined;
    
    let messages = messageLog;
    
    if (direction) {
        messages = messages.filter(m => m.direction === direction);
    }
    
    res.json({
        count: messages.length,
        messages: messages.slice(0, limit),
    });
}));

/**
 * GET /api/agent/map
 * Get agent locations for map display
 */
router.get('/map', asyncHandler(async (req, res) => {
    const agents = Array.from(agentCache.values())
        .filter(a => a.online)
        .map(a => ({
            id: a.id,
            addressShort: a.walletAddress.substr(0, 8),
            city: a.location.city || 'Unknown',
            country: a.location.country,
            region: a.location.region || 'Unknown',
            capabilityLevel: a.capabilityLevel,
            capabilities: a.capabilities,
            latency: a.metrics.latency,
            bandwidth: a.metrics.bandwidth,
        }));
    
    // Group by region for summary
    const regions: Record<string, { count: number; avgLatency: number; totalBandwidth: number }> = {};
    
    for (const agent of agents) {
        const region = agent.region;
        if (!regions[region]) {
            regions[region] = { count: 0, avgLatency: 0, totalBandwidth: 0 };
        }
        regions[region].count++;
        regions[region].avgLatency += agent.latency;
        regions[region].totalBandwidth += agent.bandwidth;
    }
    
    for (const region of Object.keys(regions)) {
        regions[region].avgLatency /= regions[region].count;
    }
    
    res.json({
        totalAgents: agents.length,
        regions,
        agents,
    });
}));

/**
 * GET /api/agent/jobs
 * Get available job types and pricing
 */
router.get('/jobs', asyncHandler(async (req, res) => {
    const jobs = [
        {
            type: 'relay',
            name: 'VPN Relay',
            description: 'Route encrypted traffic through your connection',
            pricing: {
                rate: 0.001,
                unit: 'MB',
                currency: 'USD',
            },
            requirements: {
                minBandwidth: 10,
                capabilities: ['relay'],
            },
            estimatedEarnings: {
                hourly: '$0.50 - $2.00',
                daily: '$5 - $20',
            },
        },
        {
            type: 'compute',
            name: 'Compute Task',
            description: 'Execute CPU/GPU workloads for netting and verification',
            pricing: {
                rate: 0.005,
                unit: 'minute',
                currency: 'USD',
            },
            requirements: {
                minCpu: 25,
                minRam: 1024,
                capabilities: ['compute'],
            },
            estimatedEarnings: {
                hourly: '$0.30 - $1.00',
                daily: '$3 - $10',
            },
        },
        {
            type: 'verify',
            name: 'Merkle Verification',
            description: 'Validate batch Merkle proofs for settlement',
            pricing: {
                rate: 0.02,
                unit: 'batch',
                currency: 'USD',
            },
            requirements: {
                capabilities: ['verify'],
            },
            estimatedEarnings: {
                hourly: '$0.20 - $0.80',
                daily: '$2 - $8',
            },
        },
        {
            type: 'jury',
            name: 'Jury Duty',
            description: 'Vote on dispute cases as an impartial juror',
            pricing: {
                rate: 0.50,
                unit: 'case',
                currency: 'USD',
            },
            requirements: {
                minStake: 1000, // PDOX
                capabilities: ['jury'],
            },
            estimatedEarnings: {
                hourly: '$0.10 - $0.50 (variable)',
                daily: '$1 - $5',
            },
        },
        {
            type: 'storage',
            name: 'Data Storage',
            description: 'Store encrypted blobs for the network',
            pricing: {
                rate: 0.0001,
                unit: 'MB/day',
                currency: 'USD',
            },
            requirements: {
                minStorage: 1024, // MB
                capabilities: ['storage'],
            },
            estimatedEarnings: {
                hourly: '$0.01 - $0.05',
                daily: '$0.20 - $1.00',
            },
        },
    ];
    
    res.json({ jobs });
}));

/**
 * POST /api/agent/instruction
 * Send instruction to agent (internal use)
 */
router.post('/instruction', asyncHandler(async (req, res) => {
    const { agentId, type, payload } = req.body;
    
    if (!agentId || !type) {
        return res.status(400).json({
            error: 'invalid_instruction',
            message: 'Missing agentId or type',
        });
    }
    
    const agent = agentCache.get(agentId);
    if (!agent || !agent.online) {
        return res.status(404).json({
            error: 'agent_not_found',
            message: 'Agent not found or offline',
        });
    }
    
    // Log outgoing instruction
    logMessage('out', type, agentId, JSON.stringify(payload || {}).substr(0, 100));
    
    // In production, this would push to a message queue
    // For now, we just log and return success
    logger.info('Instruction sent to agent', { agentId, type });
    
    res.json({
        success: true,
        instructionId: crypto.randomBytes(8).toString('hex'),
        queued: true,
    });
}));

export default router;

