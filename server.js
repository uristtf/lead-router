const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ADMIN PASSWORD ───────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'systems!';

// ── AGENTS CONFIG ────────────────────────────────────────
let agents = [
  {
    id: "AGT001",
    name: "Logan Obrien",
    locationId: "x0YMXY8w0lNoVMuUgF8K",
    apiKey: process.env.AGT001_API_KEY,
    states: ["CA", "NV", "AZ", "UT"],
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

let pointer = 0;

// ── PRIORITY CALCULATOR ──────────────────────────────────
function recalculatePriorities() {
  const active = agents.filter(a => a.active);
  if (active.length === 0) return;
  const min = Math.min(...active.map(a => a.weeklyLeads));
  agents = agents.map(a => ({
    ...a,
    priority: a.active ? Math.round(a.weeklyLeads / min) : 1
  }));
  pointer = 0;
}

function buildQueue() {
  const q = [];
  agents.filter(a => a.active).forEach(a => {
    for (let i = 0; i < a.priority; i++) q.push(a.id);
  });
  return q;
}

function getNextAgent(state) {
  const queue = buildQueue();
  if (!queue.length) return null;
  const eligible = new Set(
    agents.filter(a => a.active && a.states.includes(state)).map(a => a.id)
  );
  for (let i = 0; i < queue.length * 2; i++) {
    const id = queue[pointer % queue.length];
    pointer = (pointer + 1) % queue.length;
    if (eligible.has(id)) return agents.find(a => a.id === id);
  }
  return null;
}

async function getPipelineAndStage(agent, stageName) {
  const response = await axios.get(
    'https://services.leadconnectorhq.com/opportunities/pipelines?locationId=' + agent.locationId,
    {
      headers: {
        'Authorization': 'Bearer ' + agent.apiKey,
        'Version': '2021-07-28',
      }
    }
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

// ── ADMIN MIDDLEWARE ─────────────────────────────────────
function checkAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + ADMIN_PASSWORD) return next();
  const cookie = req.headers['cookie'];
  if (cookie && cookie.includes('admin_auth=' + ADMIN_PASSWORD)) return next();
  res.redirect('/admin/login');
}

// ── ADMIN ROUTES ─────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LeadRouter Admin</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a18; color: #ddd; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .box { background: #111128; border: 1px solid #2a2a3e; border-radius: 12px; padding: 40px; width: 360px; }
        h1 { color: #e8c547; font-size: 22px; margin-bottom: 8px; }
        p { color: #555; font-size: 13px; margin-bottom: 24px; }
        input { width: 100%; background: #0d0d1f; border: 1px solid #2a2a3e; border-radius: 7px; padding: 10px 14px; color: #ddd; font-size: 14px; margin-bottom: 14px; }
        button { width: 100%; background: #e8c547; color: #0a0a18; border: none; border-radius: 7px; padding: 11px; font-weight: 700; font-size: 14px; cursor: pointer; }
        .error { color: #ff5555; font-size: 12px; margin-bottom: 12px; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>⟳ LeadRouter</h1>
        <p>Admin Dashboard — Enter your password to continue</p>
        <form method="POST" action="/admin/login">
          <input type="password" name="password" placeholder="Password" autofocus />
          <button type="submit">Login</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.setHeader('Set-Cookie', `admin_auth=${ADMIN_PASSWORD}; Path=/; HttpOnly`);
    res.redirect('/admin');
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LeadRouter Admin</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0a0a18; color: #ddd; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .box { background: #111128; border: 1px solid #2a2a3e; border-radius: 12px; padding: 40px; width: 360px; }
          h1 { color: #e8c547; font-size: 22px; margin-bottom: 8px; }
          p { color: #555; font-size: 13px; margin-bottom: 24px; }
          input { width: 100%; background: #0d0d1f; border: 1px solid #2a2a3e; border-radius: 7px; padding: 10px 14px; color: #ddd; font-size: 14px; margin-bottom: 14px; }
          button { width: 100%; background: #e8c547; color: #0a0a18; border: none; border-radius: 7px; padding: 11px; font-weight: 700; font-size: 14px; cursor: pointer; }
          .error { color: #ff5555; font-size: 12px; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>⟳ LeadRouter</h1>
          <p>Admin Dashboard</p>
          <p class="error">Wrong password. Try again.</p>
          <form method="POST" action="/admin/login">
            <input type="password" name="password" placeholder="Password" autofocus />
            <button type="submit">Login</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }
});

app.get('/admin', checkAuth, (req, res) => {
  const queue = buildQueue();
  const agentRows = agents.map(a => `
    <tr>
      <td>${a.name}</td>
      <td><span class="state-list">${a.states.join(', ')}</span></td>
      <td>${a.weeklyLeads}</td>
      <td>${a.priority}</td>
      <td>${queue.filter(id => id === a.id).length} / ${queue.length}</td>
      <td>
        <span class="badge ${a.active ? 'active' : 'paused'}">${a.active ? 'Active' : 'Paused'}</span>
      </td>
      <td>
        <button onclick="editAgent('${a.id}', '${a.name}', '${a.states.join(',')}', ${a.weeklyLeads}, ${a.active})" class="btn-edit">Edit</button>
        <button onclick="toggleAgent('${a.id}')" class="btn-toggle">${a.active ? 'Pause' : 'Resume'}</button>
      </td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LeadRouter Admin</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a18; color: #ddd; font-family: 'Segoe UI', sans-serif; padding: 24px; }
        h1 { color: #e8c547; font-size: 22px; margin-bottom: 4px; }
        .subtitle { color: #555; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; background: #111128; border-radius: 12px; overflow: hidden; }
        th { background: #0d0d1f; color: #555; font-size: 11px; letter-spacing: 1px; padding: 12px 16px; text-align: left; }
        td { padding: 12px 16px; border-bottom: 1px solid #1a1a2e; font-size: 13px; }
        .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
        .badge.active { background: #55ff8822; color: #55ff88; border: 1px solid #55ff8844; }
        .badge.paused { background: #ff555522; color: #ff5555; border: 1px solid #ff555544; }
        .btn-edit { background: #e8c54722; color: #e8c547; border: 1px solid #e8c54744; border-radius: 5px; padding: 4px 10px; font-size: 11px; cursor: pointer; margin-right: 4px; }
        .btn-toggle { background: #1a1a2e; color: #888; border: 1px solid #2a2a3e; border-radius: 5px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
        .state-list { color: #8888cc; font-family: monospace; font-size: 11px; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000000aa; align-items: center; justify-content: center; }
        .modal.open { display: flex; }
        .modal-box { background: #111128; border: 1px solid #2a2a3e; border-radius: 12px; padding: 28px; width: 400px; }
        .modal-box h2 { color: #e8c547; font-size: 16px; margin-bottom: 20px; }
        label { display: block; color: #555; font-size: 10px; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; }
        input, textarea { width: 100%; background: #0d0d1f; border: 1px solid #2a2a3e; border-radius: 7px; padding: 9px 12px; color: #ddd; font-size: 13px; margin-bottom: 14px; }
        .btn-save { background: #e8c547; color: #0a0a18; border: none; border-radius: 7px; padding: 9px 20px; font-weight: 700; font-size: 13px; cursor: pointer; margin-right: 8px; }
        .btn-cancel { background: transparent; color: #666; border: 1px solid #2a2a3e; border-radius: 7px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
        .stats { display: flex; gap: 0; margin-bottom: 20px; background: #111128; border: 1px solid #1a1a2e; border-radius: 10px; overflow: hidden; }
        .stat { flex: 1; padding: 14px 20px; border-right: 1px solid #1a1a2e; }
        .stat:last-child { border-right: none; }
        .stat-label { color: #444; font-size: 9px; letter-spacing: 1.5px; margin-bottom: 4px; }
        .stat-value { color: #e8c547; font-size: 20px; font-weight: 900; }
        .logout { float: right; background: transparent; color: #555; border: 1px solid #2a2a3e; border-radius: 6px; padding: 5px 12px; font-size: 11px; cursor: pointer; text-decoration: none; }
      </style>
    </head>
    <body>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <h1>⟳ LeadRouter Admin</h1>
        <a href="/admin/logout" class="logout">Logout</a>
      </div>
      <div class="subtitle">Manage agents, lead allocations, and licensed states</div>

      <div class="stats">
        <div class="stat"><div class="stat-label">TOTAL AGENTS</div><div class="stat-value">${agents.length}</div></div>
        <div class="stat"><div class="stat-label">ACTIVE</div><div class="stat-value">${agents.filter(a=>a.active).length}</div></div>
        <div class="stat"><div class="stat-label">QUEUE SIZE</div><div class="stat-value">${queue.length}</div></div>
        <div class="stat"><div class="stat-label">TOTAL WEEKLY LEADS</div><div class="stat-value">${agents.filter(a=>a.active).reduce((s,a)=>s+a.weeklyLeads,0)}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>AGENT</th>
            <th>LICENSED STATES</th>
            <th>WEEKLY LEADS</th>
            <th>PRIORITY</th>
            <th>QUEUE SLOTS</th>
            <th>STATUS</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>${agentRows}</tbody>
      </table>

      <div class="modal" id="editModal">
        <div class="modal-box">
          <h2>Edit Agent</h2>
          <input type="hidden" id="editId" />
          <label>AGENT NAME</label>
          <input type="text" id="editName" />
          <label>LICENSED STATES (comma separated, e.g. AZ,UT,NV)</label>
          <input type="text" id="editStates" placeholder="AZ,UT,NV,CA" />
          <label>WEEKLY LEADS</label>
          <input type="number" id="editLeads" min="1" />
          <div>
            <button class="btn-save" onclick="saveAgent()">Save Changes</button>
            <button class="btn-cancel" onclick="closeModal()">Cancel</button>
          </div>
        </div>
      </div>

      <script>
        function editAgent(id, name, states, leads, active) {
          document.getElementById('editId').value = id;
          document.getElementById('editName').value = name;
          document.getElementById('editStates').value = states;
          document.getElementById('editLeads').value = leads;
          document.getElementById('editModal').classList.add('open');
        }
        function closeModal() {
          document.getElementById('editModal').classList.remove('open');
        }
        async function saveAgent() {
          const id = document.getElementById('editId').value;
          const name = document.getElementById('editName').value;
          const states = document.getElementById('editStates').value.split(',').map(s => s.trim().toUpperCase());
          const weeklyLeads = parseInt(document.getElementById('editLeads').value);
          const res = await fetch('/admin/update-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${ADMIN_PASSWORD}' },
            body: JSON.stringify({ id, name, states, weeklyLeads })
          });
          if (res.ok) { closeModal(); location.reload(); }
          else { alert('Error saving changes'); }
        }
        async function toggleAgent(id) {
          const res = await fetch('/admin/toggle-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${ADMIN_PASSWORD}' },
            body: JSON.stringify({ id })
          });
          if (res.ok) location.reload();
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/admin/update-agent', checkAuth, (req, res) => {
  const { id, name, states, weeklyLeads } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  agent.name = name;
  agent.states = states;
  agent.weeklyLeads = weeklyLeads;
  recalculatePriorities();
  res.json({ success: true, agents });
});

app.post('/admin/toggle-agent', checkAuth, (req, res) => {
  const { id } = req.body;
  const agent = agents.find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  agent.active = !agent.active;
  recalculatePriorities();
  res.json({ success: true });
});

app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/admin/login');
});

// ── MAIN WEBHOOK ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('LeadRouter is running!');
});

app.post('/webhook/ghl-lead', async (req, res) => {
  try {
    const firstName = req.body.firstName || req.body.first_name || req.body.contact?.firstName || '';
    const lastName = req.body.lastName || req.body.last_name || req.body.contact?.lastName || '';
    const email = req.body.email || req.body.contact?.email || '';
    const phone = req.body.phone || req.body.phoneNumber || req.body.contact?.phone || '';
    const state = (req.body.State || req.body.state || '').toUpperCase().trim();

    console.log('Incoming lead:', { firstName, lastName, state });

    if (!state) {
      return res.status(400).json({ status: 'error', reason: 'No state provided' });
    }

    const agent = getNextAgent(state);
    if (!agent) {
      console.log('No licensed agent for state: ' + state);
      return res.json({ status: 'unrouted', reason: 'No licensed agent for ' + state });
    }

    console.log('Routing to: ' + agent.name);
    console.log('Using locationId: ' + agent.locationId + ' with key ending: ' + agent.apiKey?.slice(-6));

    let contactId;
    try {
      const contactResponse = await axios.post(
        'https://services.leadconnectorhq.com/contacts/',
        { firstName, lastName, email, phone, locationId: agent.locationId },
        {
          headers: {
            'Authorization': 'Bearer ' + agent.apiKey,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          }
        }
      );
      contactId = contactResponse.data.contact.id;
      console.log('Contact created: ' + contactId);
    } catch (contactErr) {
      contactId = contactErr.response?.data?.meta?.contactId;
      if (!contactId) throw contactErr;
      console.log('Duplicate contact, using existing ID: ' + contactId);
    }

    const pipelineInfo = await getPipelineAndStage(agent, 'Outreach Attempt');
    if (!pipelineInfo) {
      console.log('Could not find Outreach Attempt stage for ' + agent.name);
      return res.json({ status: 'partial', note: 'Contact created but no pipeline stage found' });
    }

    await axios.post(
      'https://services.leadconnectorhq.com/opportunities/',
      {
        name: (firstName + ' ' + lastName).trim() || 'New Lead',
        contactId,
        locationId: agent.locationId,
        pipelineId: pipelineInfo.pipelineId,
        pipelineStageId: pipelineInfo.stageId,
        status: 'open',
      },
      {
        headers: {
          'Authorization': 'Bearer ' + agent.apiKey,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        }
      }
    );

    console.log('Opportunity created -> ' + agent.name);
    res.json({ status: 'routed', agent: agent.name });

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: err.response?.data || err.message });
  }
});

recalculatePriorities();
app.listen(3000, () => console.log('LeadRouter running on port 3000'));
