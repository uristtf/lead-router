const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'systems!';

let agents = [
  {
    id: "AGT001",
    name: "Logan Obrien",
    locationId: "x0YMXY8w0lNoVMuUgF8K",
    apiKey: process.env.AGT001_API_KEY,
    states: ["AZ", "UT", "NV", "CA", "AK", "CO", "CT", "DC", "FL", "HI", "IA", "ID", "IL", "KY", "MD", "ME", "MI", "MO", "MT", "NC", "NE", "NM", "NV", "OH", "PA", "SC", "TN", "TX", "VA", "WI", "WV"],
    priority: 1,
    active: true,
    leadsReceived: 0,
    color: "#5ec4ff",
  },
  {
     id: "AGT002",
    name: "Payton Phillips",
    locationId: "kFPKCnye3Y5T9c6Cbdl8",
    apiKey: process.env.AGT005_API_KEY,
    states: ["FL", "wv", "SC", "NC", "VA"],
    priority: 1,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  {
     id: "AGT003",
    name: "Joseph Hawatmeh",
    locationId: "gRF4ZSW0aEghzC2n6d1K",
    apiKey: process.env.AGT004_API_KEY,
    states: ["FL", "AL", "SC", "NC", "AR", "AZ", "CA", "HI", "IL", "IN", "MI", "MO", "NM", "OH", "OR", "PA", "TN", "TX", "VA", "WA"],
    priority: 1,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  {
    id: "AGT004",
    name: "Zach Moreno",
    locationId: "gHhpbYKAxx3zJoYh7aGc",
    apiKey: process.env.AGT002_API_KEY,
    states: ["AZ", "UT", "NV", "CA", "AK", "CO", "CT", "DC", "FL", "HI", "IA", "ID", "IL", "KY", "MD", "ME", "MI", "MO", "MT", "NC", "NE", "NM", "NV", "OH", "PA", "SC", "TN", "TX", "VA", "WI", "WV"],
    priority: 1,
    active: true,
    leadsReceived: 0,
    color: "#e8c547",
  },
   {
    id: "AGT005",
    name: "Payson Reed",
    locationId: "UcIWFPa7iW18LuWlWRpE",
    apiKey: process.env.AGT003_API_KEY,
    states: ["FL", "CT", "SC", "NC", "AL", "AZ", "CA", "GA", "IL", "IN", "MI", "NM", "OH", "NC", "TX", "WA", "VI", "PA", "OR"],
    priority: 1,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  ];

let metaPointer = 0;
let googlePointer = 0;
let activityLog = [];

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

function buildQueueForSource(source) {
  const q = [];
  const leadsKey = source === 'meta-ads' ? 'metaLeads' : 'googleLeads';
  agents.filter(a => a.active && a[leadsKey] > 0).forEach(a => {
    const min = Math.min(...agents
      .filter(x => x.active && x[leadsKey] > 0)
      .map(x => x[leadsKey]));
    const slots = Math.max(1, Math.round(a[leadsKey] / min));
    for (let i = 0; i < slots; i++) q.push(a.id);
  });
  return q;
}

function getNextAgent(state, source) {
  const queue = buildQueueForSource(source);
  if (!queue.length) return null;
  const eligible = new Set(
    agents.filter(a => {
      const leadsKey = source === 'meta-ads' ? 'metaLeads' : 'googleLeads';
      return a.active && a[leadsKey] > 0 && a.states.includes(state);
    }).map(a => a.id)
  );
  if (eligible.size === 0) return null;
  let pointer = source === 'meta-ads' ? metaPointer : googlePointer;
  for (let i = 0; i < queue.length * 2; i++) {
    const id = queue[pointer % queue.length];
    pointer = (pointer + 1) % queue.length;
    if (eligible.has(id)) {
      if (source === 'meta-ads') metaPointer = pointer;
      else googlePointer = pointer;
      return agents.find(a => a.id === id);
    }
  }
  return null;
}

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
  if (src === 'campaign' || body.facebook_leadgen_id) return 'meta-ads';
  if (src === 'marketplace') return 'google-ads';
  return 'unknown';
}

function parseLeadFields(body) {
  return {
    firstName: body.first_name || body.firstName || body.contact?.firstName || '',
    lastName: body.last_name || body.lastName || body.contact?.lastName || '',
    email: body.email || body.contact?.email || '',
    phone: body.phone || body.textable_phone || body.phoneNumber || body.contact?.phone || '',
    state: (body.region || body.State || body.state || body.contact?.state || '').toUpperCase().trim(),
    leadSource: detectLeadSource(body),
  };
}

function checkAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + ADMIN_PASSWORD) return next();
  const cookie = req.headers['cookie'] || '';
  if (cookie.includes('admin_auth=' + ADMIN_PASSWORD)) return next();
  res.redirect('/admin/login');
}

const sourceColors = {
  'meta-ads': { bg: '#1877f222', color: '#1877f2', border: '#1877f244', label: 'Meta Ads' },
  'google-ads': { bg: '#34a85322', color: '#34a853', border: '#34a85344', label: 'Google Ads' },
  'unknown': { bg: '#88888822', color: '#888', border: '#88888844', label: 'Unknown' },
};

function sourceTag(source) {
  const s = sourceColors[source] || sourceColors['unknown'];
  return `<span style="background:${s.bg};color:${s.color};border:1px solid ${s.border};border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;">${s.label}</span>`;
}

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a18; color: #ddd; font-family: 'Segoe UI', sans-serif; padding: 24px; }
  h1 { color: #e8c547; font-size: 22px; margin-bottom: 4px; }
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
  td { padding: 12px 16px; border-bottom: 1px solid #1a1a2e; font-size: 13px; }
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
  .state-list { color: #8888cc; font-family: monospace; font-size: 11px; }
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
  .log-entry { display: flex; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #1a1a2e; font-size: 12px; align-items: flex-start; }
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
`;

function adminPage(activeTab, content) {
  return `<!DOCTYPE html><html><head><title>LeadRouter Admin</title><style>${styles}</style></head><body>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <h1>⟳ LeadRouter Admin</h1>
      <a href="/admin/logout" class="logout">Logout</a>
    </div>
    <div class="subtitle">Manage agents, lead allocations, and licensed states</div>
    <div class="tabs">
      <a href="/admin" class="tab ${activeTab === 'agents' ? 'active' : ''}">Agents</a>
      <a href="/admin/log" class="tab ${activeTab === 'log' ? 'active' : ''}">Activity Log</a>
      <a href="/admin/webhook" class="tab ${activeTab === 'webhook' ? 'active' : ''}">Webhook Setup</a>
    </div>
    ${content}
  </body></html>`;
}

app.get('/admin/login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>LeadRouter Admin</title><style>
    ${styles} body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:0;}
    .box{background:#111128;border:1px solid #2a2a3e;border-radius:12px;padding:40px;width:360px;}
  </style></head><body>
    <div class="box">
      <h1>⟳ LeadRouter</h1>
      <p class="subtitle">Admin Dashboard — Enter password to continue</p>
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
    res.send(`<!DOCTYPE html><html><head><title>LeadRouter Admin</title><style>
      ${styles} body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:0;}
      .box{background:#111128;border:1px solid #2a2a3e;border-radius:12px;padding:40px;width:360px;}
      .error{color:#ff5555;font-size:12px;margin-bottom:12px;}
    </style></head><body>
      <div class="box">
        <h1>⟳ LeadRouter</h1>
        <p class="subtitle">Admin Dashboard</p>
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

app.get('/admin', checkAuth, (req, res) => {
  const metaQueue = buildQueueForSource('meta-ads');
  const googleQueue = buildQueueForSource('google-ads');

  const agentRows = agents.map(a => `
    <tr>
      <td style="font-weight:600;color:#fff">${a.name}</td>
      <td><span class="state-list">${a.states.join(', ')}</span></td>
      <td>
        <div class="source-split">
          <div>
            <div class="source-label" style="color:#1877f2">META</div>
            <div class="source-value" style="color:#1877f2">${a.metaLeads}</div>
          </div>
          <div>
            <div class="source-label" style="color:#34a853">GOOGLE</div>
            <div class="source-value" style="color:#34a853">${a.googleLeads}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-size:11px;color:#555">
          Meta: ${metaQueue.filter(id => id === a.id).length}/${metaQueue.length}<br/>
          Google: ${googleQueue.filter(id => id === a.id).length}/${googleQueue.length}
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

  const totalMeta = agents.filter(a => a.active).reduce((s, a) => s + a.metaLeads, 0);
  const totalGoogle = agents.filter(a => a.active).reduce((s, a) => s + a.googleLeads, 0);

  const content = `
    <div class="stats">
      <div class="stat"><div class="stat-label">TOTAL AGENTS</div><div class="stat-value">${agents.length}</div></div>
      <div class="stat"><div class="stat-label">ACTIVE</div><div class="stat-value">${agents.filter(a => a.active).length}</div></div>
      <div class="stat"><div class="stat-label">WEEKLY META LEADS</div><div class="stat-value" style="color:#1877f2">${totalMeta}</div></div>
      <div class="stat"><div class="stat-label">WEEKLY GOOGLE LEADS</div><div class="stat-value" style="color:#34a853">${totalGoogle}</div></div>
      <div class="stat"><div class="stat-label">LEADS ROUTED TODAY</div><div class="stat-value">${activityLog.filter(e => e.status === 'routed').length}</div></div>
    </div>

    <div class="section-title">Agent Roster</div>
    <button class="btn-add" onclick="openAddModal()">+ Add New Agent</button>

    <table>
      <thead><tr>
        <th>AGENT</th><th>LICENSED STATES</th><th>WEEKLY LEADS</th>
        <th>QUEUE SLOTS</th><th>STATUS</th><th>ACTIONS</th>
      </tr></thead>
      <tbody>${agentRows}</tbody>
    </table>

    <div class="modal" id="editModal">
      <div class="modal-box">
        <h2>Edit Agent</h2>
        <input type="hidden" id="editId" />
        <label>AGENT NAME</label>
        <input type="text" id="editName" />
        <label>LICENSED STATES (comma separated e.g. AZ,UT,NV)</label>
        <input type="text" id="editStates" placeholder="AZ,UT,NV" />
        <div class="two-col">
          <div>
            <label style="color:#1877f2">META ADS LEADS/WEEK</label>
            <input type="number" id="editMetaLeads" min="0" />
          </div>
          <div>
            <label style="color:#34a853">GOOGLE ADS LEADS/WEEK</label>
            <input type="number" id="editGoogleLeads" min="0" />
          </div>
        </div>
        <div style="color:#555;font-size:11px;margin-top:-8px;margin-bottom:14px">Set to 0 to exclude agent from that source queue</div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" onclick="saveAgent()">Save Changes</button>
          <button class="btn-cancel" onclick="closeModal('editModal')">Cancel</button>
        </div>
      </div>
    </div>

    <div class="modal" id="addModal">
      <div class="modal-box">
        <h2>Add New Agent</h2>
        <div class="note"><span>Important:</span> First go to Railway → Variables and add their API key as the next number e.g. <span>AGT006_API_KEY</span>. Then enter that variable name below.</div>
        <label>AGENT NAME</label><input type="text" id="addName" placeholder="John Smith" />
        <label>GHL LOCATION ID</label><input type="text" id="addLocationId" placeholder="Found in GHL sub-account URL" style="font-family:monospace" />
        <label>API KEY VARIABLE NAME</label><input type="text" id="addApiKeyVar" placeholder="AGT006_API_KEY" style="font-family:monospace" />
        <label>LICENSED STATES (comma separated)</label><input type="text" id="addStates" placeholder="AZ,UT,NV" />
        <div class="two-col">
          <div>
            <label style="color:#1877f2">META ADS LEADS/WEEK</label>
            <input type="number" id="addMetaLeads" min="0" placeholder="20" />
          </div>
          <div>
            <label style="color:#34a853">GOOGLE ADS LEADS/WEEK</label>
            <input type="number" id="addGoogleLeads" min="0" placeholder="20" />
          </div>
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
    </script>
  `;
  res.send(adminPage('agents', content));
});

app.get('/admin/log', checkAuth, (req, res) => {
  const logEntries = activityLog.length === 0
    ? '<div class="empty-log">No activity yet — leads will appear here as they come in.</div>'
    : activityLog.map(e => `
        <div class="log-entry">
          <span class="log-time">${e.time}</span>
          <span class="badge ${e.status}" style="flex-shrink:0;margin-top:1px">${e.status.toUpperCase()}</span>
          ${e.source ? sourceTag(e.source) : ''}
          <span class="log-msg">${e.message}</span>
        </div>
      `).join('');

  const metaCount = activityLog.filter(e => e.source === 'meta-ads').length;
  const googleCount = activityLog.filter(e => e.source === 'google-ads').length;
  const routedCount = activityLog.filter(e => e.status === 'routed').length;
  const unroutedCount = activityLog.filter(e => e.status === 'unrouted').length;

  const content = `
    <div class="stats">
      <div class="stat"><div class="stat-label">TOTAL ROUTED</div><div class="stat-value">${routedCount}</div></div>
      <div class="stat"><div class="stat-label">UNROUTED</div><div class="stat-value" style="color:#ff5555">${unroutedCount}</div></div>
      <div class="stat"><div class="stat-label">META ADS</div><div class="stat-value" style="color:#1877f2">${metaCount}</div></div>
      <div class="stat"><div class="stat-label">GOOGLE ADS</div><div class="stat-value" style="color:#34a853">${googleCount}</div></div>
    </div>
    <div class="log-box">
      <div class="log-header">
        <span>Live Lead Activity</span>
        <button onclick="clearLog()" class="btn btn-toggle">Clear Log</button>
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

app.get('/admin/webhook', checkAuth, (req, res) => {
  const content = `
    <div class="webhook-box">
      <h3>YOUR WEBHOOK URL</h3>
      <div class="note">Paste this URL into your WestMark Financial lead-router workflow webhook action.</div>
      <div class="code-block">https://lead-router-production.up.railway.app/webhook/ghl-lead</div>
    </div>

    <div class="webhook-box">
      <h3>LEAD SOURCE DETECTION</h3>
      <div class="note">Your router automatically detects and routes to the correct queue:</div>
      <table>
        <thead><tr><th>SOURCE</th><th>HOW DETECTED</th><th>QUEUE</th><th>TAG APPLIED</th></tr></thead>
        <tbody>
          <tr>
            <td>${sourceTag('meta-ads')}</td>
            <td style="color:#888;font-size:12px">lead_source = "campaign" OR facebook_leadgen_id present</td>
            <td style="color:#1877f2;font-size:12px;font-weight:700">Meta Queue</td>
            <td><span style="font-family:monospace;color:#888;font-size:11px">meta-ads</span></td>
          </tr>
          <tr>
            <td>${sourceTag('google-ads')}</td>
            <td style="color:#888;font-size:12px">lead_source = "marketplace"</td>
            <td style="color:#34a853;font-size:12px;font-weight:700">Google Queue</td>
            <td><span style="font-family:monospace;color:#888;font-size:11px">google-ads</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="webhook-box">
      <h3>WESTMARK FINANCIAL — LEAD ROUTER WORKFLOW</h3>
      <div class="step"><div class="step-num">1</div><div class="step-content">Trigger: <strong>Contact Created</strong> — no filters</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-content">Action: <strong>Webhook → POST</strong> to the URL above</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-content">Custom Data: <strong>State → {{contact.state}}</strong> and <strong>leadSource → {{contact.lead_source}}</strong></div></div>
      <div class="step"><div class="step-num">4</div><div class="step-content">Make sure workflow is <strong>Published</strong></div></div>
    </div>

    <div class="webhook-box">
      <h3>OTHER GHL — ACL LEAD INPUT WORKFLOW</h3>
      <div class="step"><div class="step-num">1</div><div class="step-content">After Create Contact, add <strong>If/Else condition</strong>: Lead Source contains "campaign"</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-content">YES branch → <strong>Add Tag: meta-ads</strong> → Copy Contact to WestMark → Update Opportunity</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-content">NO branch → <strong>Add Tag: google-ads</strong> → Copy Contact to WestMark → Update Opportunity</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-content">In Copy Contact: <strong>Copy Tags ON</strong>, Copy Custom Fields ON, no tags hardcoded</div></div>
    </div>
  `;
  res.send(adminPage('webhook', content));
});

app.post('/admin/update-agent', checkAuth, (req, res) => {
  const { id, name, states, metaLeads, googleLeads } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  agent.name = name;
  agent.states = states;
  agent.metaLeads = metaLeads;
  agent.googleLeads = googleLeads;
  res.json({ success: true });
});

app.post('/admin/add-agent', checkAuth, (req, res) => {
  const { name, locationId, apiKeyVar, states, metaLeads, googleLeads } = req.body;
  const id = 'AGT' + String(agents.length + 1).padStart(3, '0');
  const apiKey = process.env[apiKeyVar];
  agents.push({ id, name, locationId, apiKey, states, metaLeads, googleLeads, active: true });
  addLog('routed', `Agent added: ${name} (${states.join(', ')}) — Meta: ${metaLeads}, Google: ${googleLeads}`);
  res.json({ success: true });
});

app.post('/admin/toggle-agent', checkAuth, (req, res) => {
  const { id } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  agent.active = !agent.active;
  addLog(agent.active ? 'routed' : 'unrouted', `Agent ${agent.active ? 'resumed' : 'paused'}: ${agent.name}`);
  res.json({ success: true });
});

app.post('/admin/delete-agent', checkAuth, (req, res) => {
  const { id } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  addLog('unrouted', `Agent removed: ${agent.name}`);
  agents = agents.filter(a => a.id !== id);
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

app.get('/', (req, res) => res.send('LeadRouter is running!'));

app.post('/webhook/ghl-lead', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, state, leadSource } = parseLeadFields(req.body);
    console.log('Incoming lead:', { firstName, lastName, state, leadSource });

    if (!state) {
      addLog('unrouted', `Lead with no state — ${firstName} ${lastName}`, leadSource);
      return res.status(400).json({ status: 'error', reason: 'No state provided' });
    }

    const agent = getNextAgent(state, leadSource);
    if (!agent) {
      addLog('unrouted', `No licensed agent for ${state} [${leadSource}] — ${firstName} ${lastName}`, leadSource);
      return res.json({ status: 'unrouted', reason: `No licensed agent for ${state} in ${leadSource} queue` });
    }

    console.log(`Routing to: ${agent.name} via ${leadSource} queue`);

    let contactId;
    try {
      const contactResponse = await axios.post(
        'https://services.leadconnectorhq.com/contacts/',
        { firstName, lastName, email, phone, locationId: agent.locationId },
        { headers: { 'Authorization': 'Bearer ' + agent.apiKey, 'Content-Type': 'application/json', 'Version': '2021-07-28' } }
      );
      contactId = contactResponse.data.contact.id;
    } catch (contactErr) {
      contactId = contactErr.response?.data?.meta?.contactId;
      if (!contactId) throw contactErr;
    }

    if (leadSource && leadSource !== 'unknown') {
      await applyTagToContact(agent, contactId, leadSource);
    }

    const pipelineInfo = await getPipelineAndStage(agent);
    if (!pipelineInfo) {
      addLog('error', `No Outreach Attempt stage for ${agent.name}`, leadSource);
      return res.json({ status: 'partial', note: 'Contact created but no pipeline stage found' });
    }

    const sourceLabel = leadSource === 'meta-ads' ? 'Meta Ads' : leadSource === 'google-ads' ? 'Google Ads' : 'Lead';
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

    addLog('routed', `${firstName} ${lastName} (${state}) → ${agent.name}`, leadSource);
    res.json({ status: 'routed', agent: agent.name, source: leadSource });

  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    addLog('error', `Error: ${errMsg}`);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: errMsg });
  }
});

app.listen(3000, () => console.log('LeadRouter running on port 3000'));
