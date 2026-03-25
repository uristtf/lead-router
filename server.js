const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const agents = [
  {
    id: "AGT002",
    name: "Zach Moreno",
    locationId: "gHhpbYKAxx3zJoYh7aGc",
    apiKey: process.env.AGT002_API_KEY,
    states: ["AZ", "UT", "NV", "CA", "AK", "CO", "CT", "DC", "FL", "HI", "IA", "ID", "IL", "KY", "MD", "ME", "MI", "MO", "MT", "NC", "NE", "NM", "NV", "OH", "PA", "SC", "TN", "TX", "VA", "WI", "WV"],
    priority: 2,
    active: true,
    leadsReceived: 0,
    color: "#e8c547",
  },
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
    id: "AGT003",
    name: "Payson Reed",
    locationId: "UcIWFPa7iW18LuWlWRpE",
    apiKey: process.env.AGT003_API_KEY,
    states: ["FL", "CT", "SC", "NC", "AL", "AZ", "CA", "GA", "IL", "IN", "MI", "NM", "OH", "NC", "TX", "WA", "VI", "PA", "OR"],
    priority: 3,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  {
     id: "AGT004",
    name: "Joseph Hawatmeh",
    locationId: "gRF4ZSW0aEghzC2n6d1K",
    apiKey: process.env.AGT004_API_KEY,
    states: ["FL", "AL", "SC", "NC", "AR", "AZ", "CA", "HI", "IL", "IN", "MI", "MO", "NM", "OH", "OR", "PA", "TN", "TX", "VA", "WA"],
    priority: 4,
    active: true,
    leadsReceived: 0,
    color: "#a78bfa",
  },
  {
     id: "AGT005",
    name: "Payton Phillips",
    locationId: "kFPKCnye3Y5T9c6Cbdl8",
    apiKey: process.env.AGT005_API_KEY,
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
  const pipelines = response.data.pipelines;
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      if (stage.name === stageName) {
        return { pipelineId: pipeline.id, stageId: stage.id };
      }
    }
  }
  return null;
}

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

    // Step 1: Create contact
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

    const contactId = contactResponse.data.contact.id;
    console.log('Contact created: ' + contactId);

    // Step 2: Auto-find pipeline and stage
    const pipelineInfo = await getPipelineAndStage(agent, 'Outreach Attempt');
    if (!pipelineInfo) {
      console.log('Could not find Outreach Attempt stage for ' + agent.name);
      return res.json({ status: 'partial', note: 'Contact created but no pipeline stage found' });
    }

    // Step 3: Create opportunity in Outreach Attempt
    await axios.post(
      'https://services.leadconnectorhq.com/opportunities/',
      {
        name: (firstName + ' ' + lastName).trim(),
        contactId: contactId,
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

app.listen(3000, () => console.log('LeadRouter running on port 3000'));
