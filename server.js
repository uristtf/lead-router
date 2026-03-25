const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const agents = [
  {
    id: "AGT001",
    name: "Zach Moreno",
    ghlSubAccount: "gHhpbYKAxx3zJoYh7aGc",
    states: ["AZ", "UT", "NV", "CA", "AK", "CO", "CT", "DC", "FL", "HI", "IA", "ID", "IL", "KY", "MD", "ME", "MI", "MO", "MT", "NC", "NE", "NM", "NV", "OH", "PA", "SC", "TN", "TX", "VA", "WI", "WV"],
    priority: 1,
    active: true,
    leadsReceived: 0,
    color: "#e8c547",
  },
  {
    id: "AGT002",
    name: "Logan Obrien",
    ghlSubAccount: "x0YMXY8w0lNoVMuUgF8K",
    states: ["CA", "NV", "AZ", "UT"],
    priority: 2,
    active: true,
    leadsReceived: 0,
    color: "#5ec4ff",
  },
  {
    id: "AGT003",
    name: "Payson Reed",
    ghlSubAccount: "UcIWFPa7iW18LuWlWRpE",
    states: ["FL", "CT", "SC", "NC", "AL", "AZ", "CA", "GA", "IL", "IN", "MI", "NM", "OH", "NC", "TX", "WA", "VI", "PA", "OR"],
    priority: 3,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  {
     id: "AGT004",
    name: "Joseph Hawatmeh",
    ghlSubAccount: "gRF4ZSW0aEghzC2n6d1K",
    states: ["FL", "AL", "SC", "NC", "AR", "AZ", "CA", "HI", "IL", "IN", "MI", "MO", "NM", "OH", "OR", "PA", "TN", "TX", "VA", "WA"],
    priority: 4,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  {
     id: "AGT005",
    name: "Payton Phillips",
    ghlSubAccount: "kFPKCnye3Y5T9c6Cbdl8",
    states: ["FL", "wv", "SC", "NC", "VA"],
    priority: 5,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  ];

let pointer = 0;

function buildQueue() {
  const q = [];
  agents.filter(a => a.active).forEach(a => {
    for (let i = 0; i < a.priority; i++) {
      q.push(a.id);
    }
  });
  return q;
}

function getNextAgent(state) {
  const queue = buildQueue();
  if (queue.length === 0) return null;
  const eligible = new Set(
    agents.filter(a => a.active && a.states.includes(state)).map(a => a.id)
  );
  for (let i = 0; i < queue.length * 2; i++) {
    const id = queue[pointer % queue.length];
    pointer = (pointer + 1) % queue.length;
    if (eligible.has(id)) {
      return agents.find(a => a.id === id);
    }
  }
  return null;
}

app.get('/', (req, res) => {
  res.send('LeadRouter is running!');
});

app.post('/webhook/ghl-lead', async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const state = (req.body.state || req.body.customFields?.state || '').toUpperCase();

    if (!state) {
      return res.status(400).json({ status: 'error', reason: 'No state provided' });
    }

    const agent = getNextAgent(state);

    if (!agent) {
      console.log('No licensed agent for state: ' + state);
      return res.json({ status: 'unrouted', reason: 'No licensed agent for ' + state });
    }

    await axios.post(
      'https://rest.gohighlevel.com/v1/contacts/',
      { firstName, lastName, email, phone },
      {
        headers: {
          'Authorization': 'Bearer ' + process.env.GHL_API_KEY,
          'Content-Type': 'application/json',
          'GHL-Location-ID': agent.ghlSubAccountId,
        }
      }
    );

    console.log('Routed: ' + firstName + ' (' + state + ') to ' + agent.name);
    res.json({ status: 'routed', agent: agent.name });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.listen(3000, () => {
  console.log('LeadRouter running on port 3000');
});
