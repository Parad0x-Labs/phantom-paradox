/**
 * PHANTOM PARADOX - JOB MANAGER BACKEND
 * 
 * Core server that:
 * - Receives agent heartbeats
 * - Assigns jobs to available agents
 * - Tracks job progress
 * - Manages escrow/payments
 * - Handles disputes
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { logger } from './services/logger';
import { AgentManager } from './services/AgentManager';
import { JobManager } from './services/JobManager';
import { DisputeManager } from './services/DisputeManager';

import agentRoutes from './routes/agents';
import jobRoutes from './routes/jobs';
import disputeRoutes from './routes/disputes';
import statsRoutes from './routes/stats';

dotenv.config();

const PORT = process.env.PORT || 3001;
const app = express();
const server = createServer(app);

// ============== MIDDLEWARE ==============

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, { 
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// ============== SERVICES ==============

export const agentManager = new AgentManager();
export const jobManager = new JobManager(agentManager);
export const disputeManager = new DisputeManager(agentManager);

// ============== ROUTES ==============

app.use('/api/agents', agentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '0.1.0',
        uptime: process.uptime(),
        agents: agentManager.getOnlineCount(),
        jobs: jobManager.getActiveCount()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============== WEBSOCKET ==============

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info('WebSocket connected', { ip });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleWebSocketMessage(ws, message);
        } catch (err) {
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });
    
    ws.on('close', () => {
        logger.info('WebSocket disconnected', { ip });
    });
});

function handleWebSocketMessage(ws: any, message: any) {
    switch (message.type) {
        case 'heartbeat':
            agentManager.handleHeartbeat(message, ws);
            break;
        case 'job_complete':
            jobManager.handleJobComplete(message);
            break;
        case 'job_progress':
            jobManager.handleJobProgress(message);
            break;
        default:
            ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
}

// ============== START ==============

server.listen(PORT, () => {
    logger.info(`Job Manager started on port ${PORT}`);
    logger.info(`WebSocket available at ws://localhost:${PORT}/ws`);
    
    // Start background tasks
    agentManager.startCleanupTask();
    jobManager.startAssignmentLoop();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

