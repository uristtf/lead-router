const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'systems!';
const DATA_FILE = path.join('/tmp', 'leadrouter-data.json');
const LEADS_FILE = path.join('/tmp', 'leadrouter-leads.json');

// ── DEFAULT AGENTS ────────────────────────────────────────
const DEFAULT_AGENTS = [
  {
    id: "AGT001",
    name: "Logan Obrien",
    locationId: "x0YMXY8w0lNoVMuUgF8K",
    apiKey: process.env.AGT001_API_KEY,
    states: ["AZ", "UT", "NV", "CA", "AK", "CO", "CT", "DC", "HI", "IA", "ID", "IL", "KY", "MD", "ME", "MI", "MO", "MT", "NE", "NM", "NV", "OH", "PA", "TN", "WI"],
    metaLeads: 20,
    googleLeads: 20,
    leadsReceived: 0,
    metaReceived: 0,
    googleReceived: 0,
    active: true,
    color: "#5ec4ff",
  },
  {
     id: "AGT002",
    name: "Payton Phillips",
    locationId: "kFPKCnye3Y5T9c6Cbdl8",
    apiKey: process.env.AGT002_API_KEY,
    states: ["FL", "WV", "SC", "NC", "VA", "AR", "OK", "TX","TN", "OK", "NM", "MI", "KY", "KS"],
    metaLeads: 20,
    googleLeads: 20,
    leadsReceived: 0,
    metaReceived: 0,
    googleReceived: 0,
    active: true,
    color: "#a78bfa",
  },
  {
     id: "AGT003",
    name: "Joseph Hawatmeh",
    locationId: "gRF4ZSW0aEghzC2n6d1K",
    apiKey: process.env.AGT003_API_KEY,
    states: ["FL", "AL", "SC", "NC", "AR", "AZ", "CA", "HI", "IL", "IN", "MI", "MO", "NM", "OH", "OR", "PA", "TN", "TX", "VA", "WA"],
    metaLeads: 10,
    googleLeads: 10,
    leadsReceived: 0,
    metaReceived: 0,
    googleReceived: 0,
    active: true,
    color: "#a78bfa",
  },
  {
    id: "AGT006",
    name: "Evan Scott",
    locationId: "eofPDKfOIObsa6qC9Zmu",
    apiKey: process.env.AGT006_API_KEY,
    states: ["NC", "SC", "TX", "CA", "FL", "GA", "VA", "NV", "WA", "PA", "MI", "OH", "NJ", "TN", "LA"],
    metaLeads: 10,
    googleLeads: 10,
    leadsReceived: 0,
    metaReceived: 0,
    googleReceived: 0,
    active: true,
    color: "#a78bfa",
  },
  ];

// ── PERSISTENT STORAGE ────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const merged = DEFAULT_AGENTS.map(defaultAgent => {
        const savedAgent = saved.agents?.find(a => a.id === defaultAgent.id);
        if (savedAgent) {
          return {
            ...defaultAgent,
            states: savedAgent.states || defaultAgent.states,
            metaLeads: savedAgent.metaLeads ?? defaultAgent.metaLeads,
            googleLeads: savedAgent.googleLeads ?? defaultAgent.googleLeads,
            leadsReceived: savedAgent.leadsReceived || 0,
            metaReceived: savedAgent.metaReceived || 0,
            googleReceived: savedAgent.googleReceived || 0,
            active: savedAgent.active ?? defaultAgent.active,
          };
        }
        return defaultAgent;
      });
      saved.agents?.forEach(savedAgent => {
        if (!merged.find(a => a.id === savedAgent.id)) {
          merged.push({
            ...savedAgent,
            apiKey: process.env[savedAgent.apiKeyVar] || savedAgent.apiKey,
          });
        }
      });
      return {
        agents: merged,
        metaPointer: saved.metaPointer || 0,
        googlePointer: saved.googlePointer || 0,
        unknownPointer: saved.unknownPointer || 0,
      };
    }
  } catch (err) {
    console.log('Could not load saved data:', err.message);
  }
  return { agents: DEFAULT_AGENTS, metaPointer: 0, googlePointer: 0, unknownPointer: 0 };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      agents: agents.map(a => ({ ...a, apiKey: undefined })),
      metaPointer,
      googlePointer,
      unknownPointer,
      savedAt: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.log('Could not save data:', err.message);
  }
}

function loadLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    }
  } catch (err) {
    console.log('Could not load leads:', err.message);
  }
  return [];
}

function saveLead(entry) {
  try {
    const leads = loadLeads();
    leads.unshift(entry);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads.slice(0, 1000), null, 2));
  } catch (err) {
    console.log('Could not save lead:', err.message);
  }
}

// ── LOAD STATE ────────────────────────────────────────────
const loaded = loadData();
let agents = loaded.agents;
let metaPointer = loaded.metaPointer;
let googlePointer = loaded.googlePointer;
let unknownPointer = loaded.unknownPointer;
let activityLog = [];

console.log('LeadRouter started — MP pointer:', metaPointer, 'IUL pointer:', googlePointer);

// ── LOGGING ───────────────────────────────────────────────
function addLog(status, message, source) {
  activityLog.unshift({
    id: Math.random().toString(36).substr(2, 9),
    time: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }),
    status,
    message,
    source: source || null,
  });
  if (activityLog.length > 200) activityLog = activityLog.slice(0, 200);
}

// ── QUEUE LOGIC ───────────────────────────────────────────
function buildQueueForSource(source) {
  const leadsKey = source === 'mp-lead' ? 'metaLeads'
    : source === 'iul-lead' ? 'googleLeads'
    : 'metaLeads';
  const eligible = agents.filter(a => a.active && a[leadsKey] > 0);
  if (!eligible.length) return [];
  const min = Math.min(...eligible.map(a => a[leadsKey]));
  const q = [];
  eligible.forEach(a => {
    const slots = Math.max(1, Math.round(a[leadsKey] / min));
    for (let i = 0; i < slots; i++) q.push(a.id);
  });
  return q;
}

function getNextAgent(state, source) {
  const queue = buildQueueForSource(source);
  if (!queue.length) return null;
  const leadsKey = source === 'mp-lead' ? 'metaLeads'
    : source === 'iul-lead' ? 'googleLeads'
    : 'metaLeads';
  const eligible = new Set(
    agents.filter(a => a.active && a[leadsKey] > 0 && a.states.includes(state)).map(a => a.id)
  );
  if (!eligible.size) return null;
  let pointer = source === 'mp-lead' ? metaPointer
    : source === 'iul-lead' ? googlePointer
    : unknownPointer;
  for (let i = 0; i < queue.length * 2; i++) {
    const id = queue[pointer % queue.length];
    pointer = (pointer + 1) % queue.length;
    if (eligible.has(id)) {
      if (source === 'mp-lead') metaPointer = pointer;
      else if (source === 'iul-lead') googlePointer = pointer;
      else unknownPointer = pointer;
      saveData();
      return agents.find(a => a.id === id);
    }
  }
  return null;
}

// ── GHL HELPERS ───────────────────────────────────────────
async function getPipelineAndStage(agent) {
  const response = await axios.get(
    'https://services.leadconnectorhq.com/opportunities/pipelines?locationId=' + agent.locationId,
    { headers: { 'Authorization': 'Bearer ' + agent.apiKey, 'Version': '2021-07-28' } }
  );
  for (const pipeline of response.data.pipelines) {
    for (const stage of pipeline.stages) {
      if (stage.name === 'Outreach Attempt') {
        return { pipelineId: pipeline.id, stageId: stage.id };
      }
    }
  }
  return null;
}

async function applyTagToContact(agent, contactId, tag) {
  try {
    await axios.post(
      'https://services.leadconnectorhq.com/contacts/' + contactId + '/tags',
      { tags: [tag] },
      { headers: { 'Authorization': 'Bearer ' + agent.apiKey, 'Content-Type': 'application/json', 'Version': '2021-07-28' } }
    );
  } catch (err) {
    console.log('Tag error:', err.response?.data || err.message);
  }
}

function detectLeadSource(body) {
  const src = (body.lead_source || body.leadSource || body.source || '').toLowerCase();
  const tags = body.tags || body.contact_tags || '';
  if (typeof tags === 'string') {
    if (tags.includes('mp lead') || tags.includes('mp-lead')) return 'mp-lead';
    if (tags.includes('iul-lead') || tags.includes('iul lead')) return 'iul-lead';
  }
  if (Array.isArray(tags)) {
    if (tags.some(t => t.includes('mp lead') || t.includes('mp-lead'))) return 'mp-lead';
    if (tags.some(t => t.includes('iul-lead') || t.includes('iul lead'))) return 'iul-lead';
  }
  if (src === 'campaign' || body.facebook_leadgen_id) return 'mp-lead';
  if (src === 'marketplace') return 'iul-lead';
  if (src) return src;
  return 'unknown';
}

function parseLeadFields(body) {
  const questions = body.facebook_questions_answers || [];
  const customFields = body.custom_fields || {};

  const intent =
    questions.find(q => q.field_name === 'question_1')?.answer ||
    customFields['How Important Is It To You That Your Family Wouldnt Lose The Home If You Passed Away Unexpectedly?'] ||
    body.Intent || body.intent || body.contact?.intent || '';

const beneRelationship =
    questions.find(q => q.field_name === 'question_2')?.answer ||
    customFields['Who Is Your Beneficiary?'] ||
    body.Benerelationship || body.benerelationship || body.contact?.benerelationship || '';

const beneName =
    questions.find(q => q.field_name === 'question_3')?.answer ||
    customFields['Beneficiary name?'] ||
    body.Benename || body.benename || body.contact?.benename || '';
  
  return {
    firstName: body.first_name || body.firstName || body.contact?.firstName || '',
    lastName: body.last_name || body.lastName || body.contact?.lastName || '',
    email: body.email || body.contact?.email || '',
    phone: body.phone || body.textable_phone || body.phoneNumber || body.contact?.phone || '',
    state: (body.region || body.State || body.state || body.contact?.state || '').toUpperCase().trim(),
    leadSource: detectLeadSource(body),
    beneRelationship,
    beneName,
    intent,
  };
}

// ── AUTH ──────────────────────────────────────────────────
function checkAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + ADMIN_PASSWORD) return next();
  const cookie = req.headers['cookie'] || '';
  if (cookie.includes('admin_auth=' + ADMIN_PASSWORD)) return next();
  res.redirect('/admin/login');
}

// ── UI HELPERS ────────────────────────────────────────────
const sourceColors = {
  'mp-lead': { bg: '#e8c54722', color: '#e8c547', border: '#e8c54744', label: 'MP Lead' },
  'iul-lead': { bg: '#a78bfa22', color: '#a78bfa', border: '#a78bfa44', label: 'IUL Lead' },
  'unknown': { bg: '#88888822', color: '#888', border: '#88888844', label: 'Unknown' },
};

function sourceTag(source) {
  const s = sourceColors[source] || sourceColors['unknown'];
  return `<span style="background:${s.bg};color:${s.color};border:1px solid ${s.border};border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;">${s.label}</span>`;
}

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a18; color: #ddd; font-family: 'Segoe UI', sans-serif; padding: 24px; }
  h1 { color: #cccccc; font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 20px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 20px; }
  .tab { padding: 7px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; text-decoration: none; color: #666; }
  .tab.active { background: #e8c54722; color: #e8c547; border-color: #e8c54744; }
  .stats { display: flex; gap: 0; margin-bottom: 20px; background: #111128; border: 1px solid #1a1a2e; border-radius: 10px; overflow: hidden; }
  .stat { flex: 1; padding: 14px 20px; border-right: 1px solid #1a1a2e; }
  .stat:last-child { border-right: none; }
  .stat-label { color: #444; font-size: 9px; letter-spacing: 1.5px; margin-bottom: 4px; }
  .stat-value { color: #e8c547; font-size: 20px; font-weight: 900; }
  table { width: 100%; border-collapse: collapse; background: #111128; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
  th { background: #0d0d1f; color: #555; font-size: 11px; letter-spacing: 1px; padding: 12px 16px; text-align: left; }
  td { padding: 10px 16px; border-bottom: 1px solid #1a1a2e; font-size: 12px; }
  .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .badge.active { background: #55ff8822; color: #55ff88; border: 1px solid #55ff8844; }
  .badge.paused { background: #ff555522; color: #ff5555; border: 1px solid #ff555544; }
  .badge.routed { background: #55ff8822; color: #55ff88; border: 1px solid #55ff8844; }
  .badge.unrouted { background: #ff555522; color: #ff5555; border: 1px solid #ff555544; }
  .badge.error { background: #ff885522; color: #ff8855; border: 1px solid #ff885544; }
  .btn { border-radius: 5px; padding: 4px 10px; font-size: 11px; cursor: pointer; margin-right: 4px; border: 1px solid; }
  .btn-edit { background: #e8c54722; color: #e8c547; border-color: #e8c54744; }
  .btn-toggle { background: #1a1a2e; color: #888; border-color: #2a2a3e; }
  .btn-delete { background: #ff444422; color: #ff4444; border-color: #ff444444; }
  .btn-primary { background: #e8c547; color: #0a0a18; border: none; border-radius: 7px; padding: 9px 20px; font-weight: 700; font-size: 13px; cursor: pointer; }
  .btn-add { background: #e8c547; color: #0a0a18; border: none; border-radius: 7px; padding: 8px 16px; font-weight: 700; font-size: 12px; cursor: pointer; margin-bottom: 16px; }
  .btn-cancel { background: transparent; color: #666; border: 1px solid #2a2a3e; border-radius: 7px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
  .state-list { color: #8888cc; font-family: monospace; font-size: 10px; }
  .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000000aa; align-items: center; justify-content: center; z-index: 100; }
  .modal.open { display: flex; }
  .modal-box { background: #111128; border: 1px solid #2a2a3e; border-radius: 12px; padding: 28px; width: 460px; max-height: 90vh; overflow-y: auto; }
  .modal-box h2 { color: #e8c547; font-size: 16px; margin-bottom: 20px; }
  label { display: block; color: #555; font-size: 10px; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; }
  input { width: 100%; background: #0d0d1f; border: 1px solid #2a2a3e; border-radius: 7px; padding: 9px 12px; color: #ddd; font-size: 13px; margin-bottom: 14px; }
  .two-col { display: flex; gap: 12px; }
  .two-col > div { flex: 1; }
  .log-box { background: #111128; border: 1px solid #1a1a2e; border-radius: 12px; overflow: hidden; }
  .log-header { padding: 14px 16px; border-bottom: 1px solid #1a1a2e; display: flex; align-items: center; justify-content: space-between; }
  .log-header span { color: #fff; font-weight: 700; font-size: 13px; }
  .log-entry { display: flex; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #1a1a2e; font-size: 12px; align-items: flex-start; flex-wrap: wrap; }
  .log-time { color: #444; font-family: monospace; flex-shrink: 0; margin-top: 1px; min-width: 140px; }
  .log-msg { color: #ccc; }
  .empty-log { color: #333; text-align: center; padding: 40px; font-size: 13px; }
  .logout { background: transparent; color: #555; border: 1px solid #2a2a3e; border-radius: 6px; padding: 5px 12px; font-size: 11px; cursor: pointer; text-decoration: none; }
  .section-title { color: #fff; font-weight: 700; font-size: 14px; margin-bottom: 12px; }
  .note { color: #888; font-size: 11px; margin-bottom: 14px; line-height: 1.6; background: #0d0d1f; border: 1px solid #1a1a2e; border-radius: 6px; padding: 10px 12px; }
  .note span { color: #e8c547; }
  .webhook-box { background: #111128; border: 1px solid #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .webhook-box h3 { color: #e8c547; font-size: 12px; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; }
  .code-block { background: #0a0a14; border: 1px solid #1a1a2e; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 12px; color: #55ff88; word-break: break-all; margin-bottom: 8px; }
  .step { display: flex; gap: 14px; margin-bottom: 12px; }
  .step-num { background: #e8c54722; border: 2px solid #e8c54766; color: #e8c547; font-weight: 900; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; }
  .step-content { flex: 1; color: #888; font-size: 12px; line-height: 1.7; }
  .step-content strong { color: #fff; }
  .source-split { display: flex; gap: 8px; }
  .source-split > div { flex: 1; background: #0d0d1f; border-radius: 6px; padding: 8px 10px; }
  .source-label { font-size: 9px; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
  .source-value { font-size: 16px; font-weight: 900; }
  .count-split { display: flex; gap: 6px; }
  .count-split > div { flex: 1; background: #0d0d1f; border-radius: 6px; padding: 6px 8px; text-align: center; }
  .count-label { font-size: 9px; letter-spacing: 1px; font-weight: 700; margin-bottom: 2px; }
  .count-value { font-size: 14px; font-weight: 900; }
  .report-row:hover { background: #111128; }
  .filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-bar select, .filter-bar input { background: #111128; border: 1px solid #2a2a3e; border-radius: 7px; padding: 7px 12px; color: #ddd; font-size: 12px; margin-bottom: 0; width: auto; }
`;

function adminPage(activeTab, content) {
  return `<!DOCTYPE html><html><head><title>True West Systems LeadRouter Admin</title><style>${styles}</style></head><body>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <h1>⟳ True West Systems LeadRouter</h1>
      <a href="/admin/logout" class="logout">Logout</a>
    </div>
    <div class="subtitle">True West Systems — Lead Distribution System</div>
    <div class="tabs">
      <a href="/admin" class="tab ${activeTab === 'agents' ? 'active' : ''}">Agents</a>
      <a href="/admin/log" class="tab ${activeTab === 'log' ? 'active' : ''}">Activity Log</a>
      <a href="/admin/reports" class="tab ${activeTab === 'reports' ? 'active' : ''}">Reports</a>
      <a href="/admin/webhook" class="tab ${activeTab === 'webhook' ? 'active' : ''}">Webhook Setup</a>
    </div>
    ${content}
  </body></html>`;
}

// ── LOGIN ─────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>True West Systems LeadRouter</title><style>
    ${styles} body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:0;}
    .box{background:#111128;border:1px solid #2a2a3e;border-radius:12px;padding:40px;width:360px;}
  </style></head><body>
    <div class="box">
      <h1>⟳ True West Systems LeadRouter</h1>
      <p class="subtitle">True West Systems — Enter password to continue</p>
      <form method="POST" action="/admin/login">
        <label>PASSWORD</label>
        <input type="password" name="password" autofocus />
        <button type="submit" class="btn-primary" style="width:100%">Login</button>
      </form>
    </div>
  </body></html>`);
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.setHeader('Set-Cookie', `admin_auth=${ADMIN_PASSWORD}; Path=/; HttpOnly`);
    res.redirect('/admin');
  } else {
    res.send(`<!DOCTYPE html><html><head><title>True West Systems LeadRouter</title><style>
      ${styles} body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:0;}
      .box{background:#111128;border:1px solid #2a2a3e;border-radius:12px;padding:40px;width:360px;}
      .error{color:#ff5555;font-size:12px;margin-bottom:12px;}
    </style></head><body>
      <div class="box">
        <h1>⟳ True West Systems LeadRouter</h1>
        <p class="subtitle">True West Systems</p>
        <p class="error">Wrong password. Try again.</p>
        <form method="POST" action="/admin/login">
          <label>PASSWORD</label>
          <input type="password" name="password" autofocus />
          <button type="submit" class="btn-primary" style="width:100%">Login</button>
        </form>
      </div>
    </body></html>`);
  }
});

// ── AGENTS TAB ────────────────────────────────────────────
app.get('/admin', checkAuth, (req, res) => {
  const mpQueue = buildQueueForSource('mp-lead');
  const iulQueue = buildQueueForSource('iul-lead');
  const totalLeads = agents.reduce((s, a) => s + (a.leadsReceived || 0), 0);
  const totalMP = agents.reduce((s, a) => s + (a.metaReceived || 0), 0);
  const totalIUL = agents.reduce((s, a) => s + (a.googleReceived || 0), 0);

  const agentRows = agents.map(a => `
    <tr>
      <td style="font-weight:600;color:#fff">${a.name}</td>
      <td><span class="state-list">${a.states.join(', ')}</span></td>
      <td>
        <div class="source-split">
          <div><div class="source-label" style="color:#e8c547">MP</div><div class="source-value" style="color:#e8c547">${a.metaLeads}</div></div>
          <div><div class="source-label" style="color:#a78bfa">IUL</div><div class="source-value" style="color:#a78bfa">${a.googleLeads}</div></div>
        </div>
      </td>
      <td>
        <div class="count-split">
          <div><div class="count-label" style="color:#e8c547">MP</div><div class="count-value" style="color:#e8c547">${a.metaReceived || 0}</div></div>
          <div><div class="count-label" style="color:#a78bfa">IUL</div><div class="count-value" style="color:#a78bfa">${a.googleReceived || 0}</div></div>
          <div><div class="count-label" style="color:#fff">TOTAL</div><div class="count-value" style="color:#fff">${a.leadsReceived || 0}</div></div>
        </div>
      </td>
      <td>
        <div style="font-size:11px;color:#555">
          MP: ${mpQueue.filter(id => id === a.id).length}/${mpQueue.length || 1}<br/>
          IUL: ${iulQueue.filter(id => id === a.id).length}/${iulQueue.length || 1}
        </div>
      </td>
      <td><span class="badge ${a.active ? 'active' : 'paused'}">${a.active ? 'Active' : 'Paused'}</span></td>
      <td>
        <button onclick="editAgent('${a.id}','${a.name}','${a.states.join(',')}',${a.metaLeads},${a.googleLeads})" class="btn btn-edit">Edit</button>
        <button onclick="toggleAgent('${a.id}')" class="btn btn-toggle">${a.active ? 'Pause' : 'Resume'}</button>
        <button onclick="deleteAgent('${a.id}','${a.name}')" class="btn btn-delete">Remove</button>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="stats">
      <div class="stat"><div class="stat-label">TOTAL AGENTS</div><div class="stat-value">${agents.length}</div></div>
      <div class="stat"><div class="stat-label">ACTIVE</div><div class="stat-value">${agents.filter(a => a.active).length}</div></div>
      <div class="stat"><div class="stat-label">TOTAL ROUTED</div><div class="stat-value">${totalLeads}</div></div>
      <div class="stat"><div class="stat-label">MP LEADS ROUTED</div><div class="stat-value" style="color:#e8c547">${totalMP}</div></div>
      <div class="stat"><div class="stat-label">IUL LEADS ROUTED</div><div class="stat-value" style="color:#a78bfa">${totalIUL}</div></div>
    </div>

    <div class="section-title">Agent Roster</div>
    <button class="btn-add" onclick="openAddModal()">+ Add New Agent</button>

    <table>
      <thead><tr>
        <th>AGENT</th><th>LICENSED STATES</th><th>WEEKLY ALLOCATION</th>
        <th>LEADS RECEIVED</th><th>QUEUE SLOTS</th><th>STATUS</th><th>ACTIONS</th>
      </tr></thead>
      <tbody>${agentRows}</tbody>
    </table>

    <div style="display:flex;gap:10px;margin-bottom:20px;">
      <button onclick="resetCounts()" class="btn btn-toggle" style="padding:8px 16px;font-size:12px;">Reset Lead Counts</button>
      <button onclick="resetPointers()" class="btn btn-toggle" style="padding:8px 16px;font-size:12px;">Reset Queue Position</button>
    </div>

    <div class="modal" id="editModal">
      <div class="modal-box">
        <h2>Edit Agent</h2>
        <input type="hidden" id="editId" />
        <label>AGENT NAME</label><input type="text" id="editName" />
        <label>LICENSED STATES (comma separated e.g. AZ,UT,NV)</label>
        <input type="text" id="editStates" placeholder="AZ,UT,NV" />
        <div class="two-col">
          <div><label style="color:#e8c547">MP LEADS/WEEK</label><input type="number" id="editMetaLeads" min="0" /></div>
          <div><label style="color:#a78bfa">IUL LEADS/WEEK</label><input type="number" id="editGoogleLeads" min="0" /></div>
        </div>
        <div style="color:#555;font-size:11px;margin-top:-8px;margin-bottom:14px">Set to 0 to exclude from that source queue</div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" onclick="saveAgent()">Save Changes</button>
          <button class="btn-cancel" onclick="closeModal('editModal')">Cancel</button>
        </div>
      </div>
    </div>

    <div class="modal" id="addModal">
      <div class="modal-box">
        <h2>Add New Agent</h2>
        <div class="note"><span>Important:</span> First add their API key to Railway Variables e.g. <span>AGT006_API_KEY</span></div>
        <label>AGENT NAME</label><input type="text" id="addName" placeholder="John Smith" />
        <label>GHL LOCATION ID</label><input type="text" id="addLocationId" placeholder="From GHL sub-account URL" style="font-family:monospace" />
        <label>API KEY VARIABLE NAME</label><input type="text" id="addApiKeyVar" placeholder="AGT006_API_KEY" style="font-family:monospace" />
        <label>LICENSED STATES (comma separated)</label><input type="text" id="addStates" placeholder="AZ,UT,NV" />
        <div class="two-col">
          <div><label style="color:#e8c547">MP LEADS/WEEK</label><input type="number" id="addMetaLeads" min="0" placeholder="20" /></div>
          <div><label style="color:#a78bfa">IUL LEADS/WEEK</label><input type="number" id="addGoogleLeads" min="0" placeholder="20" /></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" onclick="addAgent()">Add Agent</button>
          <button class="btn-cancel" onclick="closeModal('addModal')">Cancel</button>
        </div>
      </div>
    </div>

    <script>
      const PASS = '${ADMIN_PASSWORD}';
      const headers = {'Content-Type':'application/json','Authorization':'Bearer '+PASS};
      function editAgent(id,name,states,metaLeads,googleLeads){
        document.getElementById('editId').value=id;
        document.getElementById('editName').value=name;
        document.getElementById('editStates').value=states;
        document.getElementById('editMetaLeads').value=metaLeads;
        document.getElementById('editGoogleLeads').value=googleLeads;
        document.getElementById('editModal').classList.add('open');
      }
      function openAddModal(){ document.getElementById('addModal').classList.add('open'); }
      function closeModal(id){ document.getElementById(id).classList.remove('open'); }
      async function saveAgent(){
        const id=document.getElementById('editId').value;
        const name=document.getElementById('editName').value;
        const states=document.getElementById('editStates').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
        const metaLeads=parseInt(document.getElementById('editMetaLeads').value)||0;
        const googleLeads=parseInt(document.getElementById('editGoogleLeads').value)||0;
        const res=await fetch('/admin/update-agent',{method:'POST',headers,body:JSON.stringify({id,name,states,metaLeads,googleLeads})});
        if(res.ok){closeModal('editModal');location.reload();}else alert('Error saving');
      }
      async function addAgent(){
        const name=document.getElementById('addName').value;
        const locationId=document.getElementById('addLocationId').value.trim();
        const apiKeyVar=document.getElementById('addApiKeyVar').value.trim();
        const states=document.getElementById('addStates').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
        const metaLeads=parseInt(document.getElementById('addMetaLeads').value)||0;
        const googleLeads=parseInt(document.getElementById('addGoogleLeads').value)||0;
        if(!name||!locationId||!apiKeyVar||!states.length){alert('Please fill in all fields');return;}
        const res=await fetch('/admin/add-agent',{method:'POST',headers,body:JSON.stringify({name,locationId,apiKeyVar,states,metaLeads,googleLeads})});
        if(res.ok){closeModal('addModal');location.reload();}else alert('Error adding agent');
      }
      async function toggleAgent(id){
        const res=await fetch('/admin/toggle-agent',{method:'POST',headers,body:JSON.stringify({id})});
        if(res.ok)location.reload();
      }
      async function deleteAgent(id,name){
        if(!confirm('Remove '+name+' from the rotation?'))return;
        const res=await fetch('/admin/delete-agent',{method:'POST',headers,body:JSON.stringify({id})});
        if(res.ok)location.reload();else alert('Error removing agent');
      }
      async function resetCounts(){
        if(!confirm('Reset all lead counts to zero?'))return;
        const res=await fetch('/admin/reset-counts',{method:'POST',headers});
        if(res.ok)location.reload();
      }
      async function resetPointers(){
        if(!confirm('Reset queue position back to start?'))return;
        const res=await fetch('/admin/reset-pointers',{method:'POST',headers});
        if(res.ok)location.reload();
      }
    </script>
  `;
  res.send(adminPage('agents', content));
});

// ── ACTIVITY LOG TAB ──────────────────────────────────────
app.get('/admin/log', checkAuth, (req, res) => {
  const logEntries = activityLog.length === 0
    ? '<div class="empty-log">No activity since last restart — check Reports tab for full history.</div>'
    : activityLog.map(e => `
        <div class="log-entry">
          <span class="log-time">${e.time}</span>
          <span class="badge ${e.status}" style="flex-shrink:0;margin-top:1px">${e.status.toUpperCase()}</span>
          ${e.source ? sourceTag(e.source) : ''}
          <span class="log-msg">${e.message}</span>
        </div>
      `).join('');

  const mpCount = activityLog.filter(e => e.source === 'mp-lead').length;
  const iulCount = activityLog.filter(e => e.source === 'iul-lead').length;
  const routedCount = activityLog.filter(e => e.status === 'routed').length;
  const unroutedCount = activityLog.filter(e => e.status === 'unrouted').length;

  const content = `
    <div class="stats">
      <div class="stat"><div class="stat-label">ROUTED (SESSION)</div><div class="stat-value">${routedCount}</div></div>
      <div class="stat"><div class="stat-label">UNROUTED</div><div class="stat-value" style="color:#ff5555">${unroutedCount}</div></div>
      <div class="stat"><div class="stat-label">MP LEADS</div><div class="stat-value" style="color:#e8c547">${mpCount}</div></div>
      <div class="stat"><div class="stat-label">IUL LEADS</div><div class="stat-value" style="color:#a78bfa">${iulCount}</div></div>
    </div>
    <div class="note">⚠️ <span>Activity log resets on server restart.</span> For permanent history see the <a href="/admin/reports" style="color:#e8c547">Reports tab</a>.</div>
    <div class="log-box">
      <div class="log-header">
        <span>Live Lead Activity (Current Session)</span>
        <button onclick="clearLog()" class="btn btn-toggle">Clear</button>
      </div>
      <div>${logEntries}</div>
    </div>
    <script>
      const PASS='${ADMIN_PASSWORD}';
      const headers={'Content-Type':'application/json','Authorization':'Bearer '+PASS};
      async function clearLog(){
        await fetch('/admin/clear-log',{method:'POST',headers});
        location.reload();
      }
    </script>
  `;
  res.send(adminPage('log', content));
});

// ── REPORTS TAB ───────────────────────────────────────────
app.get('/admin/reports', checkAuth, (req, res) => {
  const allLeads = loadLeads();
  const { agent: filterAgent, source: filterSource, status: filterStatus, search: filterSearch } = req.query;

  let filtered = allLeads;
  if (filterAgent) filtered = filtered.filter(l => l.agent === filterAgent);
  if (filterSource) filtered = filtered.filter(l => l.source === filterSource);
  if (filterStatus) filtered = filtered.filter(l => l.status === filterStatus);
  if (filterSearch) {
    const s = filterSearch.toLowerCase();
    filtered = filtered.filter(l =>
      (l.firstName + ' ' + l.lastName).toLowerCase().includes(s) ||
      (l.email || '').toLowerCase().includes(s) ||
      (l.state || '').toLowerCase().includes(s)
    );
  }

  const totalAll = allLeads.length;
  const totalRouted = allLeads.filter(l => l.status === 'routed').length;
  const totalMP = allLeads.filter(l => l.source === 'mp-lead').length;
  const totalIUL = allLeads.filter(l => l.source === 'iul-lead').length;

  const agentOptions = [...new Set(allLeads.map(l => l.agent).filter(Boolean))]
    .map(a => `<option value="${a}" ${filterAgent === a ? 'selected' : ''}>${a}</option>`).join('');

  const rows = filtered.length === 0
    ? `<tr><td colspan="8" style="text-align:center;color:#333;padding:30px">No leads found</td></tr>`
    : filtered.map(l => `
      <tr class="report-row">
        <td style="color:#888;font-family:monospace;font-size:10px">${l.time || ''}</td>
        <td style="color:#fff;font-weight:600">${l.firstName || ''} ${l.lastName || ''}</td>
        <td style="color:#8888cc;font-family:monospace">${l.state || ''}</td>
        <td>${l.source ? sourceTag(l.source) : '<span style="color:#444">—</span>'}</td>
        <td style="color:#aaa">${l.agent || '<span style="color:#444">—</span>'}</td>
        <td><span class="badge ${l.status}">${(l.status || '').toUpperCase()}</span></td>
        <td style="color:#666;font-size:11px">${l.email || ''}</td>
        <td style="color:#666;font-size:11px">${l.phone || ''}</td>
      </tr>
    `).join('');

  const content = `
    <div class="stats">
      <div class="stat"><div class="stat-label">ALL TIME LEADS</div><div class="stat-value">${totalAll}</div></div>
      <div class="stat"><div class="stat-label">ROUTED</div><div class="stat-value">${totalRouted}</div></div>
      <div class="stat"><div class="stat-label">MP LEADS</div><div class="stat-value" style="color:#e8c547">${totalMP}</div></div>
      <div class="stat"><div class="stat-label">IUL LEADS</div><div class="stat-value" style="color:#a78bfa">${totalIUL}</div></div>
      <div class="stat"><div class="stat-label">UNROUTED</div><div class="stat-value" style="color:#ff5555">${totalAll - totalRouted}</div></div>
    </div>

    <div class="filter-bar">
      <input type="text" placeholder="Search name, email, state..." value="${filterSearch || ''}"
        onchange="applyFilter('search', this.value)" style="min-width:200px" />
      <select onchange="applyFilter('agent', this.value)">
        <option value="">All Agents</option>
        ${agentOptions}
      </select>
      <select onchange="applyFilter('source', this.value)">
        <option value="">All Sources</option>
        <option value="mp-lead" ${filterSource === 'mp-lead' ? 'selected' : ''}>MP Lead</option>
        <option value="iul-lead" ${filterSource === 'iul-lead' ? 'selected' : ''}>IUL Lead</option>
        <option value="unknown" ${filterSource === 'unknown' ? 'selected' : ''}>Unknown</option>
      </select>
      <select onchange="applyFilter('status', this.value)">
        <option value="">All Status</option>
        <option value="routed" ${filterStatus === 'routed' ? 'selected' : ''}>Routed</option>
        <option value="unrouted" ${filterStatus === 'unrouted' ? 'selected' : ''}>Unrouted</option>
        <option value="error" ${filterStatus === 'error' ? 'selected' : ''}>Error</option>
      </select>
      <button onclick="clearFilters()" class="btn btn-toggle" style="padding:7px 14px">Clear Filters</button>
      <button onclick="exportCSV()" class="btn btn-edit" style="padding:7px 14px">Export CSV</button>
    </div>

    <div style="color:#555;font-size:12px;margin-bottom:10px">Showing ${filtered.length} of ${totalAll} leads</div>

    <table>
      <thead><tr>
        <th>DATE/TIME</th><th>NAME</th><th>STATE</th><th>SOURCE</th>
        <th>AGENT</th><th>STATUS</th><th>EMAIL</th><th>PHONE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <script>
      const PASS='${ADMIN_PASSWORD}';
      const headers={'Content-Type':'application/json','Authorization':'Bearer '+PASS};
      function applyFilter(key, value){
        const url = new URL(window.location);
        if(value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
        window.location = url;
      }
      function clearFilters(){ window.location = '/admin/reports'; }
      async function exportCSV(){
        const res = await fetch('/admin/export-csv', {headers});
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leads-' + new Date().toISOString().split('T')[0] + '.csv';
        a.click();
      }
    </script>
  `;
  res.send(adminPage('reports', content));
});

app.get('/admin/export-csv', checkAuth, (req, res) => {
  const allLeads = loadLeads();
  const headers = ['Date/Time','First Name','Last Name','State','Source','Agent','Status','Email','Phone'];
  const rows = allLeads.map(l => [
    l.time || '', l.firstName || '', l.lastName || '', l.state || '',
    l.source || '', l.agent || '', l.status || '', l.email || '', l.phone || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  res.send(csv);
});

// ── WEBHOOK TAB ───────────────────────────────────────────
app.get('/admin/webhook', checkAuth, (req, res) => {
  const content = `
    <div class="webhook-box">
      <h3>YOUR WEBHOOK URL</h3>
      <div class="note">Paste this into your WestMark Financial lead-router workflow webhook action.</div>
      <div class="code-block">https://lead-router-production.up.railway.app/webhook/ghl-lead</div>
    </div>
    <div class="webhook-box">
      <h3>LEAD SOURCE DETECTION</h3>
      <table>
        <thead><tr><th>SOURCE</th><th>HOW DETECTED</th><th>QUEUE</th><th>TAG APPLIED</th></tr></thead>
        <tbody>
          <tr>
            <td>${sourceTag('mp-lead')}</td>
            <td style="color:#888;font-size:12px">Contact has "mp lead" tag OR lead_source = "campaign"</td>
            <td style="color:#e8c547;font-size:12px;font-weight:700">MP Queue</td>
            <td><span style="font-family:monospace;color:#888;font-size:11px">mp-lead</span></td>
          </tr>
          <tr>
            <td>${sourceTag('iul-lead')}</td>
            <td style="color:#888;font-size:12px">Contact has "iul-lead" tag OR lead_source = "marketplace"</td>
            <td style="color:#a78bfa;font-size:12px;font-weight:700">IUL Queue</td>
            <td><span style="font-family:monospace;color:#888;font-size:11px">iul-lead</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="webhook-box">
      <h3>WESTMARK — LEAD ROUTER WORKFLOW</h3>
      <div class="step"><div class="step-num">1</div><div class="step-content">Triggers: <strong>Contact Tag Added → mp lead</strong> AND <strong>Contact Tag Added → iul-lead</strong></div></div>
      <div class="step"><div class="step-num">2</div><div class="step-content">Wait: <strong>2 minutes</strong> (allows custom fields to sync)</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-content">Action: <strong>Webhook → POST</strong> to the URL above</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-content">Custom Data: <strong>State, LeadSource, Intent, Benerelationship, Benename</strong></div></div>
      <div class="step"><div class="step-num">5</div><div class="step-content">Confirm workflow is <strong>Published</strong></div></div>
    </div>
    <div class="webhook-box">
      <h3>OTHER GHL — ACL LEAD INPUT WORKFLOW</h3>
      <div class="step"><div class="step-num">1</div><div class="step-content">Trigger: <strong>Inbound Webhook</strong></div></div>
      <div class="step"><div class="step-num">2</div><div class="step-content">Create Contact: State = <strong>{{inboundWebhookRequest.region}}</strong></div></div>
      <div class="step"><div class="step-num">3</div><div class="step-content">Add Tag: <strong>mp lead</strong> (for all MP leads)</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-content">Copy Contact to WestMark: <strong>Copy Tags ON, Copy Custom Fields ON</strong></div></div>
    </div>
  `;
  res.send(adminPage('webhook', content));
});

// ── ADMIN API ─────────────────────────────────────────────
app.post('/admin/update-agent', checkAuth, (req, res) => {
  const { id, name, states, metaLeads, googleLeads } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  agent.name = name;
  agent.states = states;
  agent.metaLeads = metaLeads;
  agent.googleLeads = googleLeads;
  saveData();
  res.json({ success: true });
});

app.post('/admin/add-agent', checkAuth, (req, res) => {
  const { name, locationId, apiKeyVar, states, metaLeads, googleLeads } = req.body;
  const id = 'AGT' + String(agents.length + 1).padStart(3, '0');
  const apiKey = process.env[apiKeyVar];
  agents.push({ id, name, locationId, apiKey, apiKeyVar, states, metaLeads, googleLeads, leadsReceived: 0, metaReceived: 0, googleReceived: 0, active: true });
  saveData();
  addLog('routed', `Agent added: ${name}`);
  res.json({ success: true });
});

app.post('/admin/toggle-agent', checkAuth, (req, res) => {
  const { id } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  agent.active = !agent.active;
  saveData();
  addLog(agent.active ? 'routed' : 'unrouted', `Agent ${agent.active ? 'resumed' : 'paused'}: ${agent.name}`);
  res.json({ success: true });
});

app.post('/admin/delete-agent', checkAuth, (req, res) => {
  const { id } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  addLog('unrouted', `Agent removed: ${agent.name}`);
  agents = agents.filter(a => a.id !== id);
  saveData();
  res.json({ success: true });
});

app.post('/admin/reset-counts', checkAuth, (req, res) => {
  agents = agents.map(a => ({ ...a, leadsReceived: 0, metaReceived: 0, googleReceived: 0 }));
  saveData();
  res.json({ success: true });
});

app.post('/admin/reset-pointers', checkAuth, (req, res) => {
  metaPointer = 0;
  googlePointer = 0;
  unknownPointer = 0;
  saveData();
  res.json({ success: true });
});

app.post('/admin/clear-log', checkAuth, (req, res) => {
  activityLog = [];
  res.json({ success: true });
});

app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/admin/login');
});

// ── MAIN WEBHOOK ──────────────────────────────────────────
app.get('/', (req, res) => res.send('AFG LeadRouter is running!'));

app.post('/webhook/ghl-lead', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, state, leadSource, beneRelationship, beneName, intent } = parseLeadFields(req.body);

    console.log('Incoming lead:', { firstName, lastName, state, leadSource });

    if (!state) {
      addLog('unrouted', `Lead with no state — ${firstName} ${lastName}`, leadSource);
      saveLead({ time: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }), firstName, lastName, email, phone, state, source: leadSource, agent: null, status: 'unrouted' });
      return res.status(400).json({ status: 'error', reason: 'No state provided' });
    }

    const agent = getNextAgent(state, leadSource);
    if (!agent) {
      addLog('unrouted', `No licensed agent for ${state} [${leadSource}] — ${firstName} ${lastName}`, leadSource);
      saveLead({ time: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }), firstName, lastName, email, phone, state, source: leadSource, agent: null, status: 'unrouted' });
      return res.json({ status: 'unrouted', reason: `No licensed agent for ${state}` });
    }

    console.log(`Routing to: ${agent.name} via ${leadSource} queue`);

    let contactId;
    try {
      const contactResponse = await axios.post(
        'https://services.leadconnectorhq.com/contacts/',
        {
          firstName,
          lastName,
          email,
          phone,
          locationId: agent.locationId,
          customFields: [
            ...(beneRelationship ? [{ key: 'benerelationship', field_value: beneRelationship }] : []),
            ...(beneName ? [{ key: 'benename', field_value: beneName }] : []),
            ...(intent ? [{ key: 'intent', field_value: intent }] : []),
          ],
        },
        { headers: { 'Authorization': 'Bearer ' + agent.apiKey, 'Content-Type': 'application/json', 'Version': '2021-07-28' } }
      );
      contactId = contactResponse.data.contact.id;
      console.log('Contact created: ' + contactId);
    } catch (contactErr) {
      contactId = contactErr.response?.data?.meta?.contactId;
      if (!contactId) throw contactErr;
      console.log('Duplicate contact, using existing ID: ' + contactId);
      try {
        await axios.put(
          'https://services.leadconnectorhq.com/contacts/' + contactId,
          {
            customFields: [
              ...(beneRelationship ? [{ key: 'benerelationship', field_value: beneRelationship }] : []),
              ...(beneName ? [{ key: 'benename', field_value: beneName }] : []),
              ...(intent ? [{ key: 'intent', field_value: intent }] : []),
            ],
          },
          { headers: { 'Authorization': 'Bearer ' + agent.apiKey, 'Content-Type': 'application/json', 'Version': '2021-07-28' } }
        );
      } catch (updateErr) {
        console.log('Could not update duplicate contact:', updateErr.message);
      }
    }

    if (leadSource && leadSource !== 'unknown') {
      await applyTagToContact(agent, contactId, leadSource);
    }

    const pipelineInfo = await getPipelineAndStage(agent);
    if (!pipelineInfo) {
      addLog('error', `No Outreach Attempt stage for ${agent.name}`, leadSource);
      saveLead({ time: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }), firstName, lastName, email, phone, state, source: leadSource, agent: agent.name, status: 'error' });
      return res.json({ status: 'partial', note: 'Contact created but no pipeline stage found' });
    }

    const sourceLabel = leadSource === 'mp-lead' ? 'MP Lead' : leadSource === 'iul-lead' ? 'IUL Lead' : 'Lead';
    const oppName = `${firstName} ${lastName} — ${sourceLabel}`.trim() || 'New Lead';

    await axios.post(
      'https://services.leadconnectorhq.com/opportunities/',
      {
        name: oppName,
        contactId,
        locationId: agent.locationId,
        pipelineId: pipelineInfo.pipelineId,
        pipelineStageId: pipelineInfo.stageId,
        status: 'open',
      },
      { headers: { 'Authorization': 'Bearer ' + agent.apiKey, 'Content-Type': 'application/json', 'Version': '2021-07-28' } }
    );

    agent.leadsReceived = (agent.leadsReceived || 0) + 1;
    if (leadSource === 'mp-lead') agent.metaReceived = (agent.metaReceived || 0) + 1;
    else if (leadSource === 'iul-lead') agent.googleReceived = (agent.googleReceived || 0) + 1;
    saveData();

    saveLead({
      time: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }),
      firstName, lastName, email, phone, state,
      source: leadSource, agent: agent.name, status: 'routed',
    });

    addLog('routed', `${firstName} ${lastName} (${state}) → ${agent.name}`, leadSource);
    console.log(`Opportunity created -> ${agent.name}`);
    res.json({ status: 'routed', agent: agent.name, source: leadSource });

  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    addLog('error', `Error: ${errMsg}`);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: errMsg });
  }
});

app.listen(3000, () => console.log('AFG LeadRouter running on port 3000'));
