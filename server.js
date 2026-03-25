import { useState, useCallback } from "react";

// ─── Utility ────────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

function generateId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

function getTimestamp() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Round Robin Engine ──────────────────────────────────────────────────────

function buildQueue(agents) {
  // Build weighted queue: agent with priority 2 appears twice, etc.
  const active = agents.filter(a => a.active);
  let queue = [];
  for (const agent of active) {
    for (let i = 0; i < (agent.priority || 1); i++) {
      queue.push(agent.id);
    }
  }
  return queue;
}

function routeLead(lead, agents, queueState) {
  // Filter agents licensed in lead's state
  const eligible = agents.filter(
    a => a.active && a.states.includes(lead.state)
  );
  if (eligible.length === 0) return null;

  const eligibleIds = new Set(eligible.map(a => a.id));

  // Find next in queue that is eligible
  let { pointer, queue } = queueState;

  // Rebuild queue if needed
  if (!queue.length) queue = buildQueue(agents);

  let attempts = 0;
  while (attempts < queue.length * 2) {
    const idx = pointer % queue.length;
    const agentId = queue[idx];
    pointer = (pointer + 1) % queue.length;
    if (eligibleIds.has(agentId)) {
      return { agentId, newPointer: pointer, newQueue: queue };
    }
    attempts++;
  }
  return null; // no eligible agent found
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_AGENTS = [
  {
    id: "AGT001",
    name: "Zach Moreno",
    ghlSubAccount: "gHhpbYKAxx3zJoYh7aGc",
    states: ["AZ", "UT", "NV", "CA"],
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
    states: ["FL", "GA", "SC", "NC"],
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
  }.
];

const SAMPLE_LEADS = [
  { name: "John Carter", state: "AZ", phone: "602-555-0101", email: "john@example.com" },
  { name: "Lisa Monroe", state: "UT", phone: "801-555-0182", email: "lisa@example.com" },
  { name: "Derek Stone", state: "FL", phone: "305-555-0143", email: "derek@example.com" },
  { name: "Amanda Cruz", state: "OK", phone: "405-555-0165", email: "amanda@example.com" },
  { name: "Tom Nguyen", state: "AZ", phone: "480-555-0177", email: "tom@example.com" },
  { name: "Rachel Kim", state: "TX", phone: "214-555-0119", email: "rachel@example.com" },
  { name: "Chris Webb", state: "GA", phone: "404-555-0133", email: "chris@example.com" },
  { name: "Dana Hill", state: "CA", phone: "310-555-0144", email: "dana@example.com" },
];

// ─── Components ──────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      background: color + "22",
      color: color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: "2px 7px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.5,
      fontFamily: "monospace",
    }}>{label}</span>
  );
}

function StatePicker({ selected, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 140, overflowY: "auto" }}>
      {US_STATES.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          style={{
            padding: "3px 7px",
            borderRadius: 4,
            border: "1px solid",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "monospace",
            background: selected.includes(s) ? "#e8c547" : "#1a1a2e",
            color: selected.includes(s) ? "#0d0d1a" : "#555",
            borderColor: selected.includes(s) ? "#e8c547" : "#2a2a3e",
            transition: "all 0.1s",
          }}
        >{s}</button>
      ))}
    </div>
  );
}

function AgentCard({ agent, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...agent });

  const save = () => {
    onUpdate({ ...draft });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{
        background: "#111128",
        border: `1px solid ${agent.color}55`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Agent Name"
            style={inputStyle}
          />
          <input
            value={draft.ghlSubAccount}
            onChange={e => setDraft(d => ({ ...d, ghlSubAccount: e.target.value }))}
            placeholder="GHL Sub-Account ID"
            style={{ ...inputStyle, fontFamily: "monospace" }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>LICENSED STATES</label>
          <StatePicker
            selected={draft.states}
            onChange={s => setDraft(d => ({
              ...d,
              states: d.states.includes(s)
                ? d.states.filter(x => x !== s)
                : [...d.states, s]
            }))}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>PRIORITY (leads per cycle)</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setDraft(d => ({ ...d, priority: n }))}
                  style={{
                    width: 34, height: 34, borderRadius: 6,
                    border: "1px solid",
                    background: draft.priority === n ? "#e8c547" : "#1a1a2e",
                    color: draft.priority === n ? "#0d0d1a" : "#777",
                    borderColor: draft.priority === n ? "#e8c547" : "#2a2a3e",
                    fontWeight: 700, cursor: "pointer",
                  }}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={save} style={btnPrimary}>Save</button>
            <button onClick={() => setEditing(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#111128",
      border: `1px solid ${agent.color}33`,
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 10,
      display: "flex",
      alignItems: "center",
      gap: 14,
      transition: "border-color 0.2s",
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: agent.color + "22",
        border: `2px solid ${agent.color}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: agent.color, fontWeight: 900, fontSize: 15,
        flexShrink: 0,
      }}>
        {agent.name.split(" ").map(n => n[0]).join("").slice(0,2)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ color: "#eee", fontWeight: 700, fontSize: 14 }}>{agent.name}</span>
          <Badge label={`P${agent.priority}`} color={agent.color} />
          {!agent.active && <Badge label="PAUSED" color="#ff5555" />}
          <span style={{ color: "#444", fontSize: 11, fontFamily: "monospace", marginLeft: 4 }}>{agent.ghlSubAccount}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {agent.states.map(s => (
            <span key={s} style={{
              background: "#1e1e38", color: "#8888cc",
              border: "1px solid #2a2a4e",
              borderRadius: 3, padding: "1px 5px",
              fontSize: 10, fontFamily: "monospace", fontWeight: 700,
            }}>{s}</span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ color: agent.color, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{agent.leadsReceived}</div>
        <div style={{ color: "#444", fontSize: 10, marginTop: 2 }}>LEADS SENT</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <button onClick={() => setEditing(true)} style={btnSmall}>Edit</button>
        <button onClick={() => onUpdate({ ...agent, active: !agent.active })}
          style={{ ...btnSmall, color: agent.active ? "#ff8855" : "#55ff88" }}>
          {agent.active ? "Pause" : "Resume"}
        </button>
        <button onClick={() => onRemove(agent.id)}
          style={{ ...btnSmall, color: "#ff4444" }}>Remove</button>
      </div>
    </div>
  );
}

function LogEntry({ entry }) {
  const statusColors = {
    routed: "#55ff88",
    unrouted: "#ff5555",
    queued: "#e8c547",
  };
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      padding: "8px 0", borderBottom: "1px solid #1a1a2e",
      fontSize: 12,
    }}>
      <span style={{ color: "#444", fontFamily: "monospace", flexShrink: 0, marginTop: 1 }}>{entry.time}</span>
      <span style={{
        background: statusColors[entry.status] + "22",
        color: statusColors[entry.status],
        border: `1px solid ${statusColors[entry.status]}44`,
        borderRadius: 3, padding: "1px 6px",
        fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
      }}>{entry.status.toUpperCase()}</span>
      <span style={{ color: "#ccc" }}>{entry.message}</span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [agents, setAgents] = useState(SAMPLE_AGENTS);
  const [queueState, setQueueState] = useState({ pointer: 0, queue: [] });
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState("agents"); // agents | simulate | webhook | docs
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: "", ghlSubAccount: "", states: [], priority: 1, active: true,
  });
  const [simLead, setSimLead] = useState({ name: "", state: "AZ", phone: "", email: "" });
  const [webhookUrl] = useState("https://your-backend.com/webhook/ghl-lead");
  const [ghlApiKey, setGhlApiKey] = useState("YOUR_GHL_API_KEY");

  const addLog = useCallback((status, message) => {
    setLogs(prev => [{ id: generateId(), time: getTimestamp(), status, message }, ...prev].slice(0, 100));
  }, []);

  const handleRoute = useCallback((lead) => {
    const result = routeLead(lead, agents, queueState);
    if (!result) {
      addLog("unrouted", `❌ No licensed agent found for ${lead.name} (${lead.state}) — lead held in queue`);
      return;
    }
    const { agentId, newPointer, newQueue } = result;
    const agent = agents.find(a => a.id === agentId);
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, leadsReceived: a.leadsReceived + 1 } : a
    ));
    setQueueState({ pointer: newPointer, queue: newQueue });
    addLog("routed", `✅ ${lead.name} (${lead.state}) → ${agent.name} [${agent.ghlSubAccount}] | Priority ${agent.priority}`);
  }, [agents, queueState, addLog]);

  const simulateBatch = () => {
    SAMPLE_LEADS.forEach((lead, i) => {
      setTimeout(() => handleRoute(lead), i * 300);
    });
  };

  const addAgent = () => {
    if (!newAgent.name || !newAgent.ghlSubAccount) return;
    const agent = {
      ...newAgent,
      id: "AGT" + generateId(),
      leadsReceived: 0,
      color: ["#e8c547","#5ec4ff","#a78bfa","#ff8855","#55ff88","#ff5588"][agents.length % 6],
    };
    setAgents(prev => [...prev, agent]);
    setNewAgent({ name: "", ghlSubAccount: "", states: [], priority: 1, active: true });
    setShowAddAgent(false);
    addLog("queued", `➕ Agent added: ${agent.name} (${agent.states.join(", ") || "no states yet"})`);
  };

  const totalLeads = agents.reduce((s, a) => s + a.leadsReceived, 0);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a18",
      color: "#ddd",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 5px; }
        input::placeholder { color: #444; }
        input:focus { outline: none; border-color: #e8c547 !important; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a2e",
        background: "#0d0d1f",
        padding: "0 24px",
        display: "flex", alignItems: "center", gap: 16, height: 58,
      }}>
        <div style={{
          background: "#e8c547", color: "#0a0a18",
          borderRadius: 8, width: 32, height: 32,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 16,
        }}>⟳</div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>LeadRouter Pro</div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>GOHIGHLEVEL ROUND ROBIN</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {[
            { id: "agents", label: "Agents" },
            { id: "simulate", label: "Simulate" },
            { id: "webhook", label: "Webhook" },
            { id: "docs", label: "Setup Guide" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? "#e8c54722" : "transparent",
              color: tab === t.id ? "#e8c547" : "#666",
              border: tab === t.id ? "1px solid #e8c54744" : "1px solid transparent",
              borderRadius: 6, padding: "5px 14px", fontSize: 12,
              fontWeight: 700, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: "flex", gap: 0,
        borderBottom: "1px solid #1a1a2e",
        background: "#0c0c1e",
      }}>
        {[
          { label: "TOTAL AGENTS", value: agents.length },
          { label: "ACTIVE", value: agents.filter(a => a.active).length },
          { label: "LEADS ROUTED", value: totalLeads },
          { label: "STATES COVERED", value: [...new Set(agents.flatMap(a => a.states))].length },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "10px 20px",
            borderRight: "1px solid #1a1a2e",
          }}>
            <div style={{ color: "#444", fontSize: 9, letterSpacing: 1.5, marginBottom: 3 }}>{s.label}</div>
            <div style={{ color: "#e8c547", fontSize: 20, fontWeight: 900 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 118px)" }}>

        {/* Main Panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* ── AGENTS TAB ── */}
          {tab === "agents" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
                <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 900 }}>Agent Roster</h2>
                <button onClick={() => setShowAddAgent(v => !v)} style={btnPrimary}>
                  {showAddAgent ? "Cancel" : "+ Add Agent"}
                </button>
              </div>

              {showAddAgent && (
                <div style={{
                  background: "#111128",
                  border: "1px solid #e8c54744",
                  borderRadius: 12, padding: 20, marginBottom: 16,
                }}>
                  <h3 style={{ color: "#e8c547", fontSize: 13, fontWeight: 700, marginBottom: 14, letterSpacing: 1 }}>NEW AGENT</h3>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <input value={newAgent.name} onChange={e => setNewAgent(d => ({ ...d, name: e.target.value }))}
                      placeholder="Full Name" style={inputStyle} />
                    <input value={newAgent.ghlSubAccount} onChange={e => setNewAgent(d => ({ ...d, ghlSubAccount: e.target.value }))}
                      placeholder="GHL Sub-Account ID" style={{ ...inputStyle, fontFamily: "monospace" }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>LICENSED STATES (click to toggle)</label>
                    <StatePicker selected={newAgent.states}
                      onChange={s => setNewAgent(d => ({
                        ...d, states: d.states.includes(s) ? d.states.filter(x => x !== s) : [...d.states, s]
                      }))} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>LEAD PRIORITY (leads per cycle)</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[1,2,3,4,5].map(n => (
                        <button key={n} onClick={() => setNewAgent(d => ({ ...d, priority: n }))}
                          style={{
                            width: 34, height: 34, borderRadius: 6, border: "1px solid",
                            background: newAgent.priority === n ? "#e8c547" : "#1a1a2e",
                            color: newAgent.priority === n ? "#0d0d1a" : "#777",
                            borderColor: newAgent.priority === n ? "#e8c547" : "#2a2a3e",
                            fontWeight: 700, cursor: "pointer",
                          }}>{n}</button>
                      ))}
                    </div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 5 }}>
                      Priority 2 = gets 2 leads for every 1 lead a Priority 1 agent gets
                    </div>
                  </div>
                  <button onClick={addAgent} style={btnPrimary}>Add Agent</button>
                </div>
              )}

              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onUpdate={updated => setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))}
                  onRemove={id => setAgents(prev => prev.filter(a => a.id !== id))}
                />
              ))}
            </div>
          )}

          {/* ── SIMULATE TAB ── */}
          {tab === "simulate" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 900, marginBottom: 16 }}>Lead Simulator</h2>
              <div style={{
                background: "#111128", border: "1px solid #2a2a3e",
                borderRadius: 12, padding: 20, marginBottom: 16,
              }}>
                <h3 style={{ color: "#e8c547", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>MANUAL LEAD ENTRY</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <input value={simLead.name} onChange={e => setSimLead(d => ({ ...d, name: e.target.value }))}
                    placeholder="Lead Name" style={inputStyle} />
                  <input value={simLead.phone} onChange={e => setSimLead(d => ({ ...d, phone: e.target.value }))}
                    placeholder="Phone" style={inputStyle} />
                  <input value={simLead.email} onChange={e => setSimLead(d => ({ ...d, email: e.target.value }))}
                    placeholder="Email" style={inputStyle} />
                  <select value={simLead.state}
                    onChange={e => setSimLead(d => ({ ...d, state: e.target.value }))}
                    style={{ ...inputStyle, cursor: "pointer", width: "auto" }}>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => handleRoute(simLead)} style={btnPrimary}>Route This Lead →</button>
                  <button onClick={simulateBatch} style={{ ...btnPrimary, background: "#1a3a2a", color: "#55ff88", borderColor: "#55ff8844" }}>
                    ⚡ Simulate 8 Sample Leads
                  </button>
                  <button onClick={() => setAgents(prev => prev.map(a => ({ ...a, leadsReceived: 0 })))}
                    style={btnGhost}>Reset Counts</button>
                </div>
              </div>

              {/* Priority visualization */}
              <div style={{ background: "#111128", border: "1px solid #2a2a3e", borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: "#e8c547", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>DISTRIBUTION PREVIEW</h3>
                <div style={{ color: "#555", fontSize: 11, marginBottom: 12 }}>
                  Current weighted queue cycle ({buildQueue(agents).length} slots):
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
                  {buildQueue(agents).map((id, i) => {
                    const a = agents.find(ag => ag.id === id);
                    return (
                      <div key={i} style={{
                        background: a?.color + "22",
                        border: `1px solid ${a?.color}55`,
                        color: a?.color,
                        borderRadius: 5, padding: "4px 10px",
                        fontSize: 11, fontWeight: 700,
                      }}>{a?.name.split(" ")[0] || "?"}</div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {agents.filter(a => a.active).map(a => (
                    <div key={a.id} style={{ flex: 1, minWidth: 140, background: "#0d0d1f", borderRadius: 8, padding: 12 }}>
                      <div style={{ color: a.color, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{a.name}</div>
                      <div style={{ background: "#1a1a2e", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{
                          background: a.color,
                          height: "100%",
                          width: totalLeads > 0 ? `${(a.leadsReceived / totalLeads * 100)}%` : "0%",
                          transition: "width 0.4s ease",
                          borderRadius: 4,
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ color: "#555", fontSize: 10 }}>{a.leadsReceived} leads</span>
                        <span style={{ color: "#555", fontSize: 10 }}>
                          {totalLeads > 0 ? Math.round(a.leadsReceived / totalLeads * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── WEBHOOK TAB ── */}
          {tab === "webhook" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 900, marginBottom: 16 }}>GoHighLevel Integration</h2>
              
              <div style={{ background: "#111128", border: "1px solid #2a2a3e", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ color: "#e8c547", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>YOUR WEBHOOK ENDPOINT</h3>
                <div style={{ color: "#555", fontSize: 12, marginBottom: 10 }}>Paste this URL into GHL → Settings → Webhooks → Contact Created</div>
                <div style={{
                  background: "#0a0a18", border: "1px solid #2a2a3e",
                  borderRadius: 8, padding: "10px 14px",
                  fontFamily: "monospace", fontSize: 12, color: "#55ff88",
                  marginBottom: 8, wordBreak: "break-all",
                }}>{webhookUrl}</div>
              </div>

              <div style={{ background: "#111128", border: "1px solid #2a2a3e", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ color: "#e8c547", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>BACKEND SERVER CODE (Node.js / Express)</h3>
                <div style={{ color: "#555", fontSize: 11, marginBottom: 12 }}>Deploy this to Railway, Render, or any Node host. Handles incoming GHL webhooks and routes leads.</div>
                <pre style={{
                  background: "#0a0a14", border: "1px solid #1a1a2e",
                  borderRadius: 8, padding: 16,
                  fontSize: 11, color: "#aac4ff", lineHeight: 1.7,
                  overflowX: "auto", fontFamily: "monospace",
                }}>{`const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ── CONFIG: paste your agents here ──────────────────
const GHL_API_KEY = process.env.GHL_API_KEY;
const agents = [
  {
    id: "AGT001",
    name: "Sarah Mitchell",
    ghlSubAccountId: "YOUR_SUBACCOUNT_ID_1",
    states: ["AZ", "UT", "NV", "CA"],
    priority: 2,   // gets 2 leads per cycle
    active: true,
  },
  {
    id: "AGT002",
    name: "Marcus Reed",
    ghlSubAccountId: "YOUR_SUBACCOUNT_ID_2",
    states: ["AZ", "TX", "OK", "NM"],
    priority: 1,
    active: true,
  },
];

// ── Round Robin State ────────────────────────────────
let queue = buildQueue();
let pointer = 0;

function buildQueue() {
  const q = [];
  agents.filter(a => a.active).forEach(a => {
    for (let i = 0; i < a.priority; i++) q.push(a.id);
  });
  return q;
}

function getNextAgent(state) {
  const eligible = new Set(
    agents.filter(a => a.active && a.states.includes(state)).map(a => a.id)
  );
  for (let i = 0; i < queue.length * 2; i++) {
    const id = queue[pointer % queue.length];
    pointer = (pointer + 1) % queue.length;
    if (eligible.has(id)) return agents.find(a => a.id === id);
  }
  return null; // no licensed agent
}

// ── GHL Webhook Handler ──────────────────────────────
app.post('/webhook/ghl-lead', async (req, res) => {
  const { firstName, lastName, email, phone, customFields } = req.body;
  const state = customFields?.state || req.body.state;
  
  if (!state) return res.status(400).json({ error: 'No state provided' });

  const agent = getNextAgent(state.toUpperCase());

  if (!agent) {
    console.log(\`No agent for state: \${state}\`);
    return res.json({ status: 'unrouted', reason: 'No licensed agent' });
  }

  // Move contact to sub-account via GHL API
  await axios.post(
    \`https://rest.gohighlevel.com/v1/contacts/\`,
    { firstName, lastName, email, phone },
    {
      headers: {
        Authorization: \`Bearer \${GHL_API_KEY}\`,
        'Content-Type': 'application/json',
        // Sub-account routing header
        'GHL-Location-ID': agent.ghlSubAccountId,
      }
    }
  );

  console.log(\`✅ \${firstName} (\${state}) → \${agent.name}\`);
  res.json({ status: 'routed', agent: agent.name });
});

app.listen(3000, () => console.log('LeadRouter running on :3000'));`}</pre>
              </div>
              
              <div style={{ background: "#111128", border: "1px solid #2a2a3e", borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: "#e8c547", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>GHL WORKFLOW AUTOMATION TRIGGER</h3>
                <div style={{ color: "#888", fontSize: 12, lineHeight: 1.8 }}>
                  In GoHighLevel, set up a Workflow:<br/>
                  <span style={{ color: "#5ec4ff" }}>1.</span> Trigger: <strong style={{color:"#fff"}}>Contact Created</strong> (in Master Account)<br/>
                  <span style={{ color: "#5ec4ff" }}>2.</span> Action: <strong style={{color:"#fff"}}>Webhook → POST</strong> to your endpoint URL<br/>
                  <span style={{ color: "#5ec4ff" }}>3.</span> Map fields: firstName, lastName, email, phone, <strong style={{color:"#e8c547"}}>state</strong> (custom field)<br/>
                  <span style={{ color: "#5ec4ff" }}>4.</span> Your server routes the lead and creates it in the correct sub-account.
                </div>
              </div>
            </div>
          )}

          {/* ── DOCS TAB ── */}
          {tab === "docs" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 900, marginBottom: 16 }}>4-Hour Setup Guide</h2>
              {[
                {
                  step: "1", time: "30 min", title: "Deploy the Backend",
                  content: "Go to railway.app or render.com → New Project → Deploy from GitHub. Create a new Node.js project with the server code from the Webhook tab. Set your GHL_API_KEY as an environment variable. Your webhook URL will be: https://your-app.railway.app/webhook/ghl-lead"
                },
                {
                  step: "2", time: "20 min", title: "Configure Agents in Code",
                  content: "Edit the agents array in server.js. For each agent: add their GHL Sub-Account ID (found in GHL → Settings → Business Info), their licensed states as 2-letter codes, and their priority number. Priority 2 means they get 2 leads for every 1 a Priority 1 agent gets."
                },
                {
                  step: "3", time: "20 min", title: "Add State Custom Field in GHL",
                  content: "In your GHL Master Account → Settings → Custom Fields → Add Field. Name it 'State', type Text. Make sure all your lead capture forms include this field. This is how the router knows which state the lead is from."
                },
                {
                  step: "4", time: "20 min", title: "Create GHL Workflow",
                  content: "GHL → Automation → Workflows → New. Trigger: Contact Created. Action: Webhook (POST) to your Railway URL. Map: firstName, lastName, email, phone, and the State custom field. Publish the workflow."
                },
                {
                  step: "5", time: "30 min", title: "Test with Simulator",
                  content: "Use the Simulate tab in this app to test your routing logic before going live. Verify that leads from states with no licensed agents show as 'unrouted' and don't get sent to wrong agents. Test priority weighting by sending 10 leads to agents with different priorities."
                },
              ].map(item => (
                <div key={item.step} style={{
                  display: "flex", gap: 16, marginBottom: 12,
                  background: "#111128", border: "1px solid #1a1a2e",
                  borderRadius: 12, padding: 18,
                }}>
                  <div style={{
                    background: "#e8c54722", border: "2px solid #e8c54766",
                    color: "#e8c547", fontWeight: 900, fontSize: 18,
                    width: 44, height: 44, borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>{item.step}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{item.title}</span>
                      <span style={{
                        background: "#1a2a1a", color: "#55ff88",
                        border: "1px solid #55ff8833",
                        borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700,
                      }}>{item.time}</span>
                    </div>
                    <p style={{ color: "#888", fontSize: 12, lineHeight: 1.7 }}>{item.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div style={{
          width: 320, borderLeft: "1px solid #1a1a2e",
          background: "#0c0c1e", display: "flex", flexDirection: "column",
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #1a1a2e",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Activity Log</span>
            <button onClick={() => setLogs([])} style={{ ...btnSmall, fontSize: 10 }}>Clear</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
            {logs.length === 0 && (
              <div style={{ color: "#333", fontSize: 12, textAlign: "center", marginTop: 40 }}>
                No activity yet.<br />Route a lead to see logs.
              </div>
            )}
            {logs.map(entry => <LogEntry key={entry.id} entry={entry} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const inputStyle = {
  background: "#0d0d1f", border: "1px solid #2a2a3e",
  borderRadius: 7, padding: "8px 12px", color: "#ddd",
  fontSize: 13, flex: 1, minWidth: 120,
};
const labelStyle = {
  display: "block", color: "#555", fontSize: 10,
  letterSpacing: 1.2, fontWeight: 700, marginBottom: 6,
};
const btnPrimary = {
  background: "#e8c547", color: "#0a0a18",
  border: "1px solid #e8c547", borderRadius: 7,
  padding: "7px 16px", fontWeight: 700, fontSize: 12,
  cursor: "pointer",
};
const btnGhost = {
  background: "transparent", color: "#666",
  border: "1px solid #2a2a3e", borderRadius: 7,
  padding: "7px 14px", fontWeight: 700, fontSize: 12,
  cursor: "pointer",
};
const btnSmall = {
  background: "#1a1a2e", color: "#888",
  border: "1px solid #2a2a3e", borderRadius: 5,
  padding: "4px 10px", fontWeight: 700, fontSize: 11,
  cursor: "pointer",
};
