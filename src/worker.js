import { Router } from 'itty-router';

const router = Router();

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
        },
    });
};

const errorResponse = (message, status = 400) => {
    return jsonResponse({ success: false, error: message }, status);
};

function generateApiKey(prefix = 'ak_') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = prefix;
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

async function checkAndResetUsage(db, apiKey) {
    const today = new Date().toISOString().split('T')[0];
    const key = await db.prepare('SELECT * FROM api_keys WHERE api_key = ?').bind(apiKey).first();
    if (key && key.last_reset !== today) {
        await db.prepare('UPDATE api_keys SET used_today = 0, last_reset = ? WHERE api_key = ?').bind(today, apiKey).run();
        key.used_today = 0;
    }
    return key;
}

router.options('*', () => new Response(null, { status: 204, headers: corsHeaders }));

// API Endpoints
router.get('/api/types', async (request, env) => {
    try {
        const { results } = await env.DB.prepare('SELECT type, description, icon, color FROM api_endpoints WHERE is_active = 1 ORDER BY type').all();
        return jsonResponse({ success: true, types: results });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.post('/api/keys', async (request, env) => {
    try {
        const { name, days, daily_limit, allowed_types, custom_key } = await request.json();
        if (!days || !daily_limit || !allowed_types) return errorResponse('Missing required fields');
        if (days < 1 || days > 365) return errorResponse('Days must be between 1 and 365');
        if (daily_limit < 1 || daily_limit > 100000) return errorResponse('Daily limit must be between 1 and 100000');
        
        let apiKey;
        if (custom_key && custom_key.startsWith('ak_')) {
            const existing = await env.DB.prepare('SELECT api_key FROM api_keys WHERE api_key = ?').bind(custom_key).first();
            if (existing) return errorResponse('Custom key already exists');
            apiKey = custom_key;
        } else {
            apiKey = generateApiKey();
        }
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + parseInt(days));
        
        await env.DB.prepare(
            `INSERT INTO api_keys (api_key, name, expiry, daily_limit, used_today, last_reset, status, allowed_types, custom_key)
             VALUES (?, ?, ?, ?, 0, DATE('now'), 'active', ?, ?)`
        ).bind(apiKey, name || null, expiry.toISOString(), parseInt(daily_limit), allowed_types, custom_key ? 1 : 0).run();
        
        return jsonResponse({
            success: true,
            key: {
                api_key: apiKey,
                name: name || null,
                expiry: expiry.toISOString(),
                daily_limit: parseInt(daily_limit),
                allowed_types: allowed_types.split(',').map(t => t.trim()),
                status: 'active',
                custom: !!custom_key
            }
        });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.get('/api/keys', async (request, env) => {
    try {
        const { results } = await env.DB.prepare(
            `SELECT k.api_key, k.name, k.expiry, k.daily_limit, k.used_today, k.last_reset, k.status, k.allowed_types, k.custom_key, k.created_at,
                    COUNT(l.id) as total_requests
             FROM api_keys k LEFT JOIN usage_logs l ON k.api_key = l.api_key
             GROUP BY k.api_key ORDER BY k.created_at DESC`
        ).all();
        return jsonResponse({ success: true, keys: results });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.get('/api/keys/:key', async (request, env) => {
    try {
        const { key } = request.params;
        const keyData = await env.DB.prepare('SELECT * FROM api_keys WHERE api_key = ?').bind(key).first();
        if (!keyData) return errorResponse('Key not found', 404);
        return jsonResponse({ success: true, key: keyData });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.put('/api/keys/:key', async (request, env) => {
    try {
        const { key } = request.params;
        const { name, addDays, daily_limit, status } = await request.json();
        const existing = await env.DB.prepare('SELECT * FROM api_keys WHERE api_key = ?').bind(key).first();
        if (!existing) return errorResponse('Key not found', 404);
        
        let updates = [], values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (addDays) {
            const newExpiry = new Date(existing.expiry);
            newExpiry.setDate(newExpiry.getDate() + parseInt(addDays));
            updates.push('expiry = ?'); values.push(newExpiry.toISOString());
        }
        if (daily_limit) { updates.push('daily_limit = ?'); values.push(parseInt(daily_limit)); }
        if (status) {
            if (!['active', 'revoked'].includes(status)) return errorResponse('Invalid status');
            updates.push('status = ?'); values.push(status);
        }
        if (updates.length === 0) return errorResponse('No updates provided');
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(key);
        await env.DB.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE api_key = ?`).bind(...values).run();
        
        const updated = await env.DB.prepare('SELECT * FROM api_keys WHERE api_key = ?').bind(key).first();
        return jsonResponse({ success: true, key: updated });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.delete('/api/keys/:key', async (request, env) => {
    try {
        const { key } = request.params;
        const result = await env.DB.prepare('UPDATE api_keys SET status = "revoked", updated_at = CURRENT_TIMESTAMP WHERE api_key = ?').bind(key).run();
        if (result.changes === 0) return errorResponse('Key not found', 404);
        return jsonResponse({ success: true, message: 'Key revoked successfully' });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.get('/api/stats', async (request, env) => {
    try {
        const url = new URL(request.url);
        const days = parseInt(url.searchParams.get('days')) || 7;
        const startDate = new Date(); startDate.setDate(startDate.getDate() - days);
        
        const stats = await env.DB.prepare(
            `SELECT DATE(timestamp) as date, api_type, COUNT(*) as requests, COUNT(DISTINCT api_key) as unique_keys,
                    AVG(response_time) as avg_response_time,
                    SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as successful
             FROM usage_logs WHERE timestamp >= ? GROUP BY DATE(timestamp), api_type ORDER BY date DESC`
        ).bind(startDate.toISOString()).all();
        
        const totals = await env.DB.prepare(
            `SELECT COUNT(*) as total_requests, COUNT(DISTINCT api_key) as active_keys, COUNT(DISTINCT api_type) as types_used
             FROM usage_logs WHERE timestamp >= ?`
        ).bind(startDate.toISOString()).first();
        
        return jsonResponse({ success: true, stats: stats.results, totals });
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

router.get('/api', async (request, env) => {
    const startTime = Date.now();
    try {
        const url = new URL(request.url);
        const params = new URLSearchParams(url.search);
        const apiKey = params.get('key');
        const type = params.get('type');
        const term = params.get('term');
        
        if (!apiKey) return errorResponse('Missing API key', 401);
        if (!type) return errorResponse('Missing type parameter', 400);
        if (!term) return errorResponse('Missing term parameter', 400);
        
        const endpoint = await env.DB.prepare('SELECT * FROM api_endpoints WHERE type = ? AND is_active = 1').bind(type).first();
        if (!endpoint) return errorResponse(`Invalid API type: ${type}`, 400);
        
        const key = await checkAndResetUsage(env.DB, apiKey);
        if (!key) return errorResponse('Invalid API key', 401);
        if (key.status !== 'active') return errorResponse('API key is revoked', 403);
        if (new Date(key.expiry) < new Date()) return errorResponse('API key has expired', 403);
        
        const allowedTypes = key.allowed_types.split(',').map(t => t.trim());
        if (!allowedTypes.includes(type) && !allowedTypes.includes('*')) return errorResponse(`Key not authorized for ${type}`, 403);
        if (key.used_today >= key.daily_limit) return errorResponse('Daily limit exceeded', 429);
        
        await env.DB.prepare('UPDATE api_keys SET used_today = used_today + 1 WHERE api_key = ?').bind(apiKey).run();
        const targetUrl = endpoint.endpoint_url + encodeURIComponent(term);
        const response = await fetch(targetUrl, { method: 'GET', headers: { 'User-Agent': 'API-Key-Manager/1.0', 'Accept': 'application/json' } });
        const responseTime = Date.now() - startTime;
        const data = await response.json();
        
        await env.DB.prepare('INSERT INTO usage_logs (api_key, api_type, term, status_code, response_time) VALUES (?, ?, ?, ?, ?)')
            .bind(apiKey, type, term, response.status, responseTime).run();
        
        if (typeof data === 'object') {
            data._metadata = { remaining: key.daily_limit - key.used_today - 1, limit: key.daily_limit, key_status: key.status };
        }
        return jsonResponse(data, response.status);
    } catch (error) {
        return errorResponse(error.message, 500);
    }
});

// Dashboard HTML
router.get('/dashboard', async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>⚡ API KEY MANAGER</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family:'Courier New',monospace; }
        body { background:#0a0a0a; color:#0f0; padding:20px; }
        .container { max-width:500px; margin:0 auto; }
        h1 { font-size:24px; margin-bottom:20px; text-shadow:0 0 10px #0f0; }
        .card { background:#1a1a1a; border:2px solid #0f0; padding:20px; margin-bottom:20px; border-radius:0; }
        .btn { width:100%; padding:15px; background:#0a0a0a; border:2px solid #0f0; color:#0f0; font-size:16px; font-weight:bold; margin-bottom:10px; cursor:pointer; }
        .btn-primary { background:#0f0; color:#0a0a0a; }
        input, select { width:100%; padding:12px; background:#0a0a0a; border:2px solid #0f0; color:#0f0; margin-bottom:15px; font-size:16px; }
        .key-display { background:#0a0a0a; padding:15px; border:2px solid #0f0; word-break:break-all; margin:15px 0; }
        .status { color:#0f0; margin:10px 0; }
        #message { background:#1a1a1a; padding:15px; border-left:5px solid #0f0; white-space:pre-wrap; font-size:12px; line-height:1.6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚡ TERMINAL API</h1>
        
        <div class="card">
            <button class="btn" onclick="showCreate()">➕ CREATE KEY</button>
            <button class="btn" onclick="listKeys()">🔑 LIST KEYS</button>
            <button class="btn" onclick="testAPI()">🚀 TEST API</button>
        </div>
        
        <div id="output"></div>
    </div>

    <script>
        const BASE = window.location.origin;
        
        async function apiCall(endpoint, method, data) {
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (data) options.body = JSON.stringify(data);
            const res = await fetch(endpoint, options);
            return await res.json();
        }

        function showCreate() {
            document.getElementById('output').innerHTML = \`
                <div class="card">
                    <h3>CREATE API KEY</h3>
                    <input type="text" id="name" placeholder="Key Name (optional)">
                    <input type="number" id="days" placeholder="Days (1-365)" value="30">
                    <input type="number" id="limit" placeholder="Daily Limit" value="1000">
                    <input type="text" id="customKey" placeholder="Custom Key (ak_... optional)">
                    <input type="text" id="types" placeholder="API Types (comma: PHONE,AADHAAR)">
                    <button class="btn btn-primary" onclick="createKey()">GENERATE</button>
                    <button class="btn" onclick="clearOutput()">BACK</button>
                </div>
            \`;
        }

        window.createKey = async () => {
            const data = {
                name: document.getElementById('name').value || undefined,
                days: parseInt(document.getElementById('days').value),
                daily_limit: parseInt(document.getElementById('limit').value),
                allowed_types: document.getElementById('types').value,
                custom_key: document.getElementById('customKey').value || undefined
            };
            
            const result = await apiCall('/api/keys', 'POST', data);
            
            if (result.success) {
                const link = \`\${BASE}/api?type=TYPE&term=VALUE&key=\${result.key.api_key}\`;
                document.getElementById('output').innerHTML = \`
                    <div class="card">
                        <h3>✅ KEY GENERATED</h3>
                        <div class="key-display">\${result.key.api_key}</div>
                        <button class="btn" onclick="copy('\${result.key.api_key}')">COPY KEY</button>
                        <button class="btn" onclick="copy('\${link}')">COPY LINK</button>
                        <div id="message">🔑 API ACCESS GRANTED
━━━━━━━━━━━━━━━━━━━━━
YOUR API KEY: \${result.key.api_key}

ALLOWED: \${result.key.allowed_types.join(', ')}
LIMIT: \${result.key.daily_limit}/day
EXPIRY: \${new Date(result.key.expiry).toLocaleDateString()}

EXAMPLE:
\${link.replace('TYPE', result.key.allowed_types[0])}</div>
                        <button class="btn" onclick="copy(document.getElementById('message').innerText)">COPY MESSAGE</button>
                    </div>
                \`;
            }
        };

        window.listKeys = async () => {
            const result = await apiCall('/api/keys', 'GET');
            if (result.success) {
                let html = '<div class="card"><h3>📋 ALL KEYS</h3>';
                result.keys.forEach(k => {
                    html += \`<div style="border-bottom:1px solid #0f0; padding:10px 0;">
                        <div>\${k.api_key.substring(0,16)}...</div>
                        <small>Used: \${k.used_today}/\${k.daily_limit} | Exp: \${new Date(k.expiry).toLocaleDateString()}</small>
                    </div>\`;
                });
                html += '<button class="btn" onclick="clearOutput()">BACK</button></div>';
                document.getElementById('output').innerHTML = html;
            }
        };

        window.testAPI = async () => {
            document.getElementById('output').innerHTML = \`
                <div class="card">
                    <h3>TEST API</h3>
                    <input type="text" id="testKey" placeholder="API Key">
                    <input type="text" id="testType" placeholder="Type (PHONE)">
                    <input type="text" id="testTerm" placeholder="Term (7676964866)">
                    <button class="btn btn-primary" onclick="runTest()">TEST</button>
                    <button class="btn" onclick="clearOutput()">BACK</button>
                </div>
            \`;
        };

        window.runTest = async () => {
            const key = document.getElementById('testKey').value;
            const type = document.getElementById('testType').value;
            const term = document.getElementById('testTerm').value;
            const url = \`\${BASE}/api?type=\${type}&term=\${term}&key=\${key}\`;
            
            try {
                const res = await fetch(url);
                const data = await res.json();
                document.getElementById('output').innerHTML = \`
                    <div class="card">
                        <h3>📡 RESPONSE</h3>
                        <pre style="background:#0a0a0a; padding:10px; overflow:auto;">\${JSON.stringify(data, null, 2)}</pre>
                        <button class="btn" onclick="clearOutput()">BACK</button>
                    </div>
                \`;
            } catch (e) {
                alert('Error: ' + e.message);
            }
        };

        window.copy = (text) => {
            navigator.clipboard.writeText(text);
            alert('Copied!');
        };

        window.clearOutput = () => {
            document.getElementById('output').innerHTML = '';
        };
    </script>
</body>
</html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html', ...corsHeaders } });
});

router.get('/', () => Response.redirect('/dashboard', 302));
router.all('*', () => jsonResponse({ success: false, error: 'ACCESS DENIED' }, 404));

export default { fetch: router.handle };
