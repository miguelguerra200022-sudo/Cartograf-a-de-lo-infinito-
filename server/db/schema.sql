-- Cartografía de lo Infinito — Database Schema
-- SQLite 3 (compatible with PostgreSQL/PostGIS migration)

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    quarks INTEGER NOT NULL DEFAULT 500,
    fuel INTEGER NOT NULL DEFAULT 20,
    sectors_explored INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sector claims — who owns what coordinates
CREATE TABLE IF NOT EXISTS sector_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    claim_type TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'premium', 'legendary'
    sector_class TEXT,
    claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(x, y, z)
);

-- Index for fast coordinate lookups
CREATE INDEX IF NOT EXISTS idx_sector_coords ON sector_claims(x, y, z);
CREATE INDEX IF NOT EXISTS idx_sector_user ON sector_claims(user_id);

-- Sector anomalies — THE SECRET TABLE (Salt Wall)
-- Pre-calculated server-side. Clients NEVER see this logic.
CREATE TABLE IF NOT EXISTS sector_anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    rarity_class TEXT NOT NULL, -- 'uncommon', 'rare', 'epic', 'legendary', 'mythic'
    loot_type TEXT NOT NULL,    -- 'mineral', 'artifact', 'blueprint', 'currency', 'key'
    loot_value INTEGER NOT NULL DEFAULT 0,
    loot_data TEXT,             -- JSON blob with specific item details
    discovered_by INTEGER REFERENCES users(id),
    discovered_at DATETIME,
    UNIQUE(x, y, z)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_coords ON sector_anomalies(x, y, z);

-- Transaction history — all economic activity
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,     -- 'scan', 'claim', 'purchase', 'sale', 'loot', 'refuel'
    amount INTEGER NOT NULL, -- positive = gain, negative = spend
    currency TEXT NOT NULL DEFAULT 'quarks', -- 'quarks', 'fuel'
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
