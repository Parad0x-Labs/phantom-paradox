-- Migration: 006_agent_heartbeats
-- Agent heartbeat tracking for Command Center dashboard

-- Agent heartbeats table
CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(32) UNIQUE NOT NULL,
    wallet_address VARCHAR(64) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
    capabilities JSONB NOT NULL DEFAULT '[]',
    
    -- Location (city-level, no precise IPs)
    country VARCHAR(3) NOT NULL,
    city VARCHAR(64),
    region VARCHAR(32),
    
    -- Metrics
    latency INTEGER DEFAULT 0,           -- ms
    bandwidth INTEGER DEFAULT 0,         -- Mbps
    uptime INTEGER DEFAULT 0,            -- seconds
    packet_loss DECIMAL(5,2) DEFAULT 0,  -- percentage
    jitter INTEGER DEFAULT 0,            -- ms
    
    -- Stats
    total_jobs INTEGER DEFAULT 0,
    total_earned BIGINT DEFAULT 0,       -- lamports
    success_rate_bps INTEGER DEFAULT 10000, -- basis points (100.00%)
    
    -- Timestamps
    first_seen TIMESTAMP DEFAULT NOW(),
    timestamp TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_country CHECK (LENGTH(country) BETWEEN 2 AND 3)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_wallet ON agent_heartbeats(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_country ON agent_heartbeats(country);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_timestamp ON agent_heartbeats(timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_platform ON agent_heartbeats(platform);

-- Telemetry snapshots table (aggregated metrics over time)
CREATE TABLE IF NOT EXISTS agent_telemetry_snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Agent counts
    total_agents INTEGER DEFAULT 0,
    online_agents INTEGER DEFAULT 0,
    agents_by_region JSONB DEFAULT '{}',
    agents_by_capability JSONB DEFAULT '{}',
    
    -- Network metrics
    total_bandwidth_gbps DECIMAL(10,3) DEFAULT 0,
    avg_latency_ms DECIMAL(10,2) DEFAULT 0,
    avg_packet_loss DECIMAL(5,2) DEFAULT 0,
    avg_jitter_ms DECIMAL(10,2) DEFAULT 0,
    throughput_mbps DECIMAL(10,2) DEFAULT 0,
    
    -- Job metrics
    active_jobs INTEGER DEFAULT 0,
    pending_jobs INTEGER DEFAULT 0,
    completed_24h INTEGER DEFAULT 0,
    tps DECIMAL(10,2) DEFAULT 0
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_telemetry_snapshots_timestamp ON agent_telemetry_snapshots(timestamp);

-- Message log table (for audit and debugging)
CREATE TABLE IF NOT EXISTS agent_message_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
    message_type VARCHAR(32) NOT NULL,
    agent_id VARCHAR(32) NOT NULL,
    payload TEXT,
    
    -- Partition by time for efficient cleanup
    created_at DATE DEFAULT CURRENT_DATE
);

-- Index for message queries
CREATE INDEX IF NOT EXISTS idx_message_log_agent ON agent_message_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_message_log_type ON agent_message_log(message_type);
CREATE INDEX IF NOT EXISTS idx_message_log_created ON agent_message_log(created_at);

-- Function to clean up old message logs (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_message_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM agent_message_log WHERE created_at < CURRENT_DATE - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- View for agent status overview
CREATE OR REPLACE VIEW agent_status_overview AS
SELECT 
    country,
    COUNT(*) as total_agents,
    COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '2 minutes') as online_agents,
    AVG(latency) as avg_latency,
    AVG(bandwidth) as avg_bandwidth,
    SUM(total_jobs) as total_jobs,
    SUM(total_earned) as total_earned
FROM agent_heartbeats
GROUP BY country
ORDER BY online_agents DESC;

-- View for capability distribution
CREATE OR REPLACE VIEW agent_capability_distribution AS
SELECT 
    cap.capability,
    COUNT(DISTINCT ah.agent_id) as agent_count,
    AVG(ah.latency) as avg_latency,
    AVG(ah.bandwidth) as avg_bandwidth
FROM agent_heartbeats ah,
     jsonb_array_elements_text(ah.capabilities) as cap(capability)
WHERE ah.timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY cap.capability
ORDER BY agent_count DESC;

COMMENT ON TABLE agent_heartbeats IS 'Stores agent heartbeat data for the Command Center dashboard';
COMMENT ON TABLE agent_telemetry_snapshots IS 'Aggregated network telemetry snapshots';
COMMENT ON TABLE agent_message_log IS 'Message log for agent communication audit';

