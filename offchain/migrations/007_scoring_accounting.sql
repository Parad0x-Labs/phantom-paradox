-- Migration: 007_scoring_accounting
-- Reputation scoring system + Corporate-level accounting

-- ============================================================
-- AGENT REPUTATION SCORING SYSTEM
-- ============================================================

-- Score tiers:
-- ELITE:     99%+ (9900+)
-- EXCELLENT: 95%+ (9500+)
-- GREAT:     90%+ (9000+)
-- GOOD:      85%+ (8500+)
-- AVERAGE:   80%+ (8000+)
-- POOR:      70%+ (7000+)
-- BAD:       60%+ (6000+)
-- TERRIBLE:  50%+ (5000+)
-- CRITICAL:  40%+ (4000+)
-- SUSPENDED: 30%+ (3000+)
-- BANNED:    20%+ (2000+)
-- BLACKLIST: <20% (0-2000)

CREATE TABLE IF NOT EXISTS agent_scores (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(64) UNIQUE NOT NULL,
    agent_id VARCHAR(32) UNIQUE NOT NULL,
    
    -- SCORE (basis points: 10000 = 100.00%)
    reputation_score INTEGER DEFAULT 8000 CHECK (reputation_score BETWEEN 0 AND 10000),
    tier VARCHAR(20) DEFAULT 'AVERAGE',
    
    -- Job metrics
    total_jobs_completed INTEGER DEFAULT 0,
    total_jobs_failed INTEGER DEFAULT 0,
    total_jobs_disputed INTEGER DEFAULT 0,
    total_jobs_won INTEGER DEFAULT 0,      -- disputes won
    
    -- Quality metrics
    avg_completion_time_secs INTEGER DEFAULT 0,
    avg_quality_rating INTEGER DEFAULT 0,   -- 1-5 stars * 100
    on_time_rate INTEGER DEFAULT 10000,     -- basis points
    
    -- Financial metrics
    total_earned_lamports BIGINT DEFAULT 0,
    total_earned_usd DECIMAL(18, 6) DEFAULT 0,
    total_penalties_lamports BIGINT DEFAULT 0,
    
    -- Streak tracking
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_job_success BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    first_job_at TIMESTAMP,
    last_job_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_level INTEGER DEFAULT 0    -- 0=none, 1=email, 2=kyc, 3=staker
);

CREATE INDEX IF NOT EXISTS idx_agent_scores_tier ON agent_scores(tier);
CREATE INDEX IF NOT EXISTS idx_agent_scores_reputation ON agent_scores(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_scores_earned ON agent_scores(total_earned_lamports DESC);

-- ============================================================
-- CORPORATE ACCOUNTING - TRANSACTION LEDGER
-- ============================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
    id SERIAL PRIMARY KEY,
    entry_id VARCHAR(64) UNIQUE NOT NULL,   -- Unique transaction ID
    
    -- Transaction type
    entry_type VARCHAR(32) NOT NULL CHECK (entry_type IN (
        'JOB_PAYMENT',       -- Payment to agent for completed job
        'JOB_REFUND',        -- Refund to client for failed job
        'DISPUTE_PAYOUT',    -- Payment from dispute resolution
        'PENALTY',           -- Penalty for failed/fraudulent job
        'BONUS',             -- Bonus for exceptional work
        'STAKE',             -- Agent staking
        'UNSTAKE',           -- Agent unstaking
        'FEE',               -- Platform fee
        'ADJUSTMENT',        -- Manual adjustment
        'AIRDROP'            -- Token airdrop
    )),
    
    -- Parties involved
    from_wallet VARCHAR(64),
    to_wallet VARCHAR(64) NOT NULL,
    
    -- Amount
    amount_lamports BIGINT NOT NULL,
    amount_usd DECIMAL(18, 6),
    token VARCHAR(20) DEFAULT 'SOL',        -- SOL, USDC, PDOX
    
    -- Reference
    job_id VARCHAR(64),
    dispute_id VARCHAR(64),
    agent_id VARCHAR(32),
    
    -- Solana transaction
    tx_signature VARCHAR(128),
    tx_slot BIGINT,
    tx_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_by VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'CONFIRMED', 'FAILED', 'REVERSED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_to_wallet ON ledger_entries(to_wallet);
CREATE INDEX IF NOT EXISTS idx_ledger_from_wallet ON ledger_entries(from_wallet);
CREATE INDEX IF NOT EXISTS idx_ledger_job ON ledger_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx ON ledger_entries(tx_signature);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(created_at);

-- ============================================================
-- JOB AUDIT LOG (Every action logged)
-- ============================================================

CREATE TABLE IF NOT EXISTS job_audit_log (
    id SERIAL PRIMARY KEY,
    audit_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Job reference
    job_id VARCHAR(64) NOT NULL,
    job_type VARCHAR(32) NOT NULL,
    
    -- Action
    action VARCHAR(32) NOT NULL CHECK (action IN (
        'CREATED', 'ASSIGNED', 'STARTED', 'PROGRESS',
        'COMPLETED', 'FAILED', 'CANCELLED', 'DISPUTED',
        'DISPUTE_RESOLVED', 'REFUNDED', 'RATED'
    )),
    
    -- Actor
    actor_type VARCHAR(20) CHECK (actor_type IN ('CLIENT', 'AGENT', 'SYSTEM', 'ADMIN')),
    actor_wallet VARCHAR(64),
    actor_agent_id VARCHAR(32),
    
    -- Details
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    details JSONB DEFAULT '{}',
    
    -- Timing
    duration_ms INTEGER,                    -- Time since last action
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_job ON job_audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON job_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON job_audit_log(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_time ON job_audit_log(timestamp);

-- ============================================================
-- DAILY ACCOUNTING SUMMARY
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_accounting (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    
    -- Volume
    total_jobs INTEGER DEFAULT 0,
    successful_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    disputed_jobs INTEGER DEFAULT 0,
    
    -- Revenue (lamports)
    total_volume_lamports BIGINT DEFAULT 0,
    agent_payouts_lamports BIGINT DEFAULT 0,
    platform_fees_lamports BIGINT DEFAULT 0,
    refunds_lamports BIGINT DEFAULT 0,
    penalties_lamports BIGINT DEFAULT 0,
    
    -- USD equivalent
    total_volume_usd DECIMAL(18, 6) DEFAULT 0,
    agent_payouts_usd DECIMAL(18, 6) DEFAULT 0,
    platform_fees_usd DECIMAL(18, 6) DEFAULT 0,
    
    -- Agent stats
    active_agents INTEGER DEFAULT 0,
    new_agents INTEGER DEFAULT 0,
    
    -- Job type breakdown
    jobs_by_type JSONB DEFAULT '{}',
    earnings_by_type JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_accounting(date DESC);

-- ============================================================
-- REAL-LIFE JOBS TABLE (Extended)
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Job classification
    category VARCHAR(32) NOT NULL CHECK (category IN (
        'RELAY', 'AI_IMAGE', 'AI_AUDIO', 'AI_TEXT', 
        'AI_VIDEO', 'VERIFICATION', 'STORAGE', 'COMPUTE'
    )),
    job_type VARCHAR(32) NOT NULL,
    
    -- Client (anonymized)
    client_id VARCHAR(64) NOT NULL,         -- Hashed wallet
    client_tier VARCHAR(20),
    
    -- Agent assignment
    agent_wallet VARCHAR(64),
    agent_id VARCHAR(32),
    agent_tier VARCHAR(20),
    
    -- Job details
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    input_size_bytes BIGINT,
    output_size_bytes BIGINT,
    
    -- Pricing (all in lamports)
    base_price_lamports BIGINT NOT NULL,
    agent_share_lamports BIGINT,           -- 97% of base
    platform_fee_lamports BIGINT,          -- 3% of base
    bonus_lamports BIGINT DEFAULT 0,
    penalty_lamports BIGINT DEFAULT 0,
    final_payout_lamports BIGINT,
    
    -- USD tracking
    price_usd DECIMAL(18, 6),
    sol_price_at_time DECIMAL(18, 6),
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
        'FAILED', 'DISPUTED', 'CANCELLED', 'REFUNDED'
    )),
    
    -- Quality
    quality_score INTEGER,                  -- 0-100
    client_rating INTEGER,                  -- 1-5
    speed_rating INTEGER,                   -- 1-5 (vs expected time)
    
    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    deadline_at TIMESTAMP,
    
    -- SLA metrics
    expected_duration_secs INTEGER,
    actual_duration_secs INTEGER,
    was_on_time BOOLEAN,
    
    -- Dispute
    dispute_id VARCHAR(64),
    dispute_reason TEXT,
    dispute_resolved_at TIMESTAMP,
    dispute_winner VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_agent ON jobs(agent_wallet);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Calculate tier from score
CREATE OR REPLACE FUNCTION get_tier_from_score(score INTEGER)
RETURNS VARCHAR(20) AS $$
BEGIN
    RETURN CASE
        WHEN score >= 9900 THEN 'ELITE'
        WHEN score >= 9500 THEN 'EXCELLENT'
        WHEN score >= 9000 THEN 'GREAT'
        WHEN score >= 8500 THEN 'GOOD'
        WHEN score >= 8000 THEN 'AVERAGE'
        WHEN score >= 7000 THEN 'POOR'
        WHEN score >= 6000 THEN 'BAD'
        WHEN score >= 5000 THEN 'TERRIBLE'
        WHEN score >= 4000 THEN 'CRITICAL'
        WHEN score >= 3000 THEN 'SUSPENDED'
        WHEN score >= 2000 THEN 'BANNED'
        ELSE 'BLACKLIST'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update agent score after job
CREATE OR REPLACE FUNCTION update_agent_score_after_job(
    p_agent_id VARCHAR(32),
    p_success BOOLEAN,
    p_quality_score INTEGER,
    p_on_time BOOLEAN,
    p_earned_lamports BIGINT
)
RETURNS INTEGER AS $$
DECLARE
    v_current_score INTEGER;
    v_new_score INTEGER;
    v_score_change INTEGER;
BEGIN
    -- Get current score
    SELECT reputation_score INTO v_current_score
    FROM agent_scores WHERE agent_id = p_agent_id;
    
    IF v_current_score IS NULL THEN
        v_current_score := 8000; -- Default for new agents
    END IF;
    
    -- Calculate score change
    IF p_success THEN
        v_score_change := 10; -- Base success bonus
        
        -- Quality bonus (0-50 points based on quality_score 0-100)
        v_score_change := v_score_change + (p_quality_score / 2);
        
        -- On-time bonus
        IF p_on_time THEN
            v_score_change := v_score_change + 20;
        END IF;
        
        -- Cap max gain at 100 per job
        v_score_change := LEAST(v_score_change, 100);
    ELSE
        -- Failure penalty
        v_score_change := -100;
        
        -- Extra penalty if not first failure
        IF NOT (SELECT last_job_success FROM agent_scores WHERE agent_id = p_agent_id) THEN
            v_score_change := v_score_change - 50; -- Consecutive failure
        END IF;
    END IF;
    
    -- Apply change with bounds
    v_new_score := GREATEST(0, LEAST(10000, v_current_score + v_score_change));
    
    -- Update agent_scores
    INSERT INTO agent_scores (agent_id, wallet_address, reputation_score, tier)
    VALUES (p_agent_id, '', v_new_score, get_tier_from_score(v_new_score))
    ON CONFLICT (agent_id) DO UPDATE SET
        reputation_score = v_new_score,
        tier = get_tier_from_score(v_new_score),
        total_jobs_completed = agent_scores.total_jobs_completed + CASE WHEN p_success THEN 1 ELSE 0 END,
        total_jobs_failed = agent_scores.total_jobs_failed + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        total_earned_lamports = agent_scores.total_earned_lamports + COALESCE(p_earned_lamports, 0),
        current_streak = CASE WHEN p_success THEN agent_scores.current_streak + 1 ELSE 0 END,
        best_streak = GREATEST(agent_scores.best_streak, 
            CASE WHEN p_success THEN agent_scores.current_streak + 1 ELSE agent_scores.best_streak END),
        last_job_success = p_success,
        last_job_at = NOW(),
        updated_at = NOW();
    
    RETURN v_new_score;
END;
$$ LANGUAGE plpgsql;

-- Get agent summary for display
CREATE OR REPLACE FUNCTION get_agent_summary(p_agent_id VARCHAR(32))
RETURNS TABLE(
    tier VARCHAR(20),
    score INTEGER,
    score_percent DECIMAL(5,2),
    total_jobs INTEGER,
    success_rate DECIMAL(5,2),
    total_earned_sol DECIMAL(18,9),
    current_streak INTEGER,
    best_streak INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.tier,
        s.reputation_score,
        s.reputation_score / 100.0,
        s.total_jobs_completed + s.total_jobs_failed,
        CASE 
            WHEN s.total_jobs_completed + s.total_jobs_failed > 0 
            THEN s.total_jobs_completed::DECIMAL / (s.total_jobs_completed + s.total_jobs_failed) * 100
            ELSE 100.0
        END,
        s.total_earned_lamports / 1000000000.0,
        s.current_streak,
        s.best_streak
    FROM agent_scores s
    WHERE s.agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE agent_scores IS 'Agent reputation scores and statistics';
COMMENT ON TABLE ledger_entries IS 'Corporate accounting ledger - every financial transaction';
COMMENT ON TABLE job_audit_log IS 'Complete audit trail for every job action';
COMMENT ON TABLE daily_accounting IS 'Daily financial summaries for reporting';
COMMENT ON TABLE jobs IS 'Detailed job records with full metadata';

