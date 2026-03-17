DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS usage_logs;
DROP TABLE IF EXISTS api_endpoints;

CREATE TABLE api_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT UNIQUE NOT NULL,
    endpoint_url TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '🔌',
    color TEXT DEFAULT '#00ff00',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO api_endpoints (type, endpoint_url, description, icon, color) VALUES
('PHONE', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=PHONE&term=', 'Phone Number Lookup', '📱', '#00ff00'),
('PAK_PHONE', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=PAK_PHONE&term=', 'Pakistan Phone', '🇵🇰', '#00ff88'),
('AADHAAR', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=AADHAAR&term=', 'Aadhaar Card', '🆔', '#00ffff'),
('FAMILY', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=FAMILY&term=', 'Family Info', '👨‍👩‍👧', '#ff00ff'),
('IFSC', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=IFSC&term=', 'IFSC Code', '🏦', '#ffff00'),
('IP', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=IP&term=', 'IP Address', '🌐', '#00aaff'),
('TG_NUM', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=TG_NUM&term=', 'Telegram Number', '📲', '#0088cc'),
('GST', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=GST&term=', 'GST Number', '📋', '#ffaa00'),
('PAN', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=PAN&term=', 'PAN Card', '💳', '#ff5500'),
('PAN_GST', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=PAN_GST&term=', 'PAN to GST', '🔄', '#ff00aa'),
('VNUM', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=VNUM&term=', 'Vehicle Number', '🚗', '#aa00ff'),
('IMEI', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=IMEI&term=', 'IMEI Number', '📟', '#00ccaa'),
('PINCODE', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=PINCODE&term=', 'Pincode', '📍', '#ff3366'),
('FREEFIRE', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=FREEFIRE&term=', 'Free Fire ID', '🎮', '#ff6600'),
('CNIC', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=CNIC&term=', 'CNIC Number', '🪪', '#00ddff'),
('UPI', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=UPI&term=', 'UPI ID', '💸', '#66ff00'),
('CHALLAN', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=CHALLAN&term=', 'Challan', '📄', '#ff44aa'),
('SMS_BOMBER', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=SMS_BOMBER&term=', 'SMS Bomber', '💣', '#ff0000'),
('INSTAGRAM', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=INSTAGRAM&term=', 'Instagram', '📷', '#ff0099'),
('VEHICLE', 'https://cosmos-api-walter.desenkamailha.workers.dev/api?type=VEHICLE&term=', 'Vehicle Details', '🚙', '#00ff99');

CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT UNIQUE NOT NULL,
    name TEXT,
    custom_key BOOLEAN DEFAULT 0,
    expiry DATETIME NOT NULL,
    daily_limit INTEGER NOT NULL DEFAULT 100,
    used_today INTEGER NOT NULL DEFAULT 0,
    last_reset DATE NOT NULL DEFAULT (DATE('now')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
    allowed_types TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT NOT NULL,
    api_type TEXT NOT NULL,
    term TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status_code INTEGER,
    response_time INTEGER,
    FOREIGN KEY (api_key) REFERENCES api_keys(api_key)
);

CREATE INDEX idx_api_key ON api_keys(api_key);
CREATE INDEX idx_status ON api_keys(status);
CREATE INDEX idx_expiry ON api_keys(expiry);
CREATE INDEX idx_usage_api_key ON usage_logs(api_key);
CREATE INDEX idx_usage_timestamp ON usage_logs(timestamp);
