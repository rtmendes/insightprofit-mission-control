// InsightProfit Instruction Router API
// Classifies instructions and routes to the best AI agent(s)

const SUPABASE_URL = 'https://supabase.insightprofit.live';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY2ODcxMjQ0LCJleHAiOjIwODIyMzEyNDR9.qtJF1pWQQr-SGHVYLv0wP4hMiamqfjrNsfsnBm-c2hI';

// ── Classification via Anthropic Claude Haiku ──────────────────────────

async function classifyInstruction(instruction, anthropicKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20250415',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Classify this instruction for an AI agent routing system. Return ONLY valid JSON with these fields:
- "type": one of [code, content, design, ops, research, strategy, sales, marketing, hr, data, infrastructure, deployment, creative, workflow, product]
- "department": one of [Product & Engineering, Marketing & Content, Revenue & Sales, Operations & Fulfillment, Brand & Creative, Strategy & Brand, Technology & Infra, HR & Talent, Finance & Analytics, Chief of Staff]
- "priority": one of [urgent, high, normal, low]
- "keywords": array of 3-5 relevant capability keywords for agent matching
- "summary": one-line summary of what needs to happen
- "requires_multiple_agents": boolean

Instruction: "${instruction.replace(/"/g, '\\"')}"

Return ONLY the JSON object, no markdown or explanation.`
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  
  // Parse JSON from response (handle potential markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse classification response');
  return JSON.parse(jsonMatch[0]);
}

// ── Agent Matching from Supabase ai_agents ──────────────────────────────

async function matchAgents(classification) {
  const { type, department, keywords } = classification;

  // Build role_type filter based on instruction type
  const typeToRole = {
    code: ['devops', 'product', 'workflow'],
    content: ['content', 'creative'],
    design: ['creative', 'content'],
    ops: ['workflow', 'orchestrator'],
    research: ['data', 'content', 'strategy'],
    strategy: ['strategy', 'orchestrator'],
    sales: ['revenue'],
    marketing: ['revenue', 'content', 'creative'],
    hr: ['general'],
    data: ['data', 'workflow'],
    infrastructure: ['devops', 'workflow'],
    deployment: ['devops', 'orchestrator'],
    creative: ['creative', 'content'],
    workflow: ['workflow', 'orchestrator'],
    product: ['product', 'devops'],
  };

  const roleTypes = typeToRole[type] || ['general', 'workflow'];

  // Query enterprise agents first (they're the core platform agents)
  const enterpriseRes = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_agents?source=eq.enterprise&status=eq.active&select=id,name,role_type,category,capabilities,platform,system_prompt`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const enterpriseAgents = enterpriseRes.ok ? await enterpriseRes.json() : [];

  // Query role-matched agents from the full pool
  const roleFilter = roleTypes.map(r => `"${r}"`).join(',');
  const poolRes = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_agents?role_type=in.(${roleTypes.join(',')})&status=eq.active&category=eq.agent&select=id,name,role_type,category,capabilities,platform&limit=20`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const poolAgents = poolRes.ok ? await poolRes.json() : [];

  // Score each agent based on keyword match + role match
  function scoreAgent(agent) {
    let score = 0;
    const caps = typeof agent.capabilities === 'string' 
      ? agent.capabilities.toLowerCase() 
      : JSON.stringify(agent.capabilities).toLowerCase();
    const name = (agent.name || '').toLowerCase();
    const prompt = (agent.system_prompt || '').toLowerCase();

    // Role type match
    if (roleTypes.includes(agent.role_type)) score += 30;

    // Keyword match against capabilities
    for (const kw of keywords) {
      if (caps.includes(kw.toLowerCase())) score += 20;
      if (name.includes(kw.toLowerCase())) score += 15;
      if (prompt.includes(kw.toLowerCase())) score += 5;
    }

    // Enterprise agents get a bonus (they're the actual execution layer)
    if (agent.category === 'platform_agent' || agent.category === 'agent_harness') score += 25;

    return { ...agent, score };
  }

  const allAgents = [...enterpriseAgents, ...poolAgents];
  const uniqueAgents = allAgents.filter((a, i, arr) => arr.findIndex(b => b.id === a.id) === i);
  const scored = uniqueAgents.map(scoreAgent).sort((a, b) => b.score - a.score);

  // Return top 5 matches
  return scored.slice(0, 5).map(a => ({
    id: a.id,
    name: a.name,
    role_type: a.role_type,
    category: a.category,
    platform: a.platform,
    score: a.score,
    confidence: Math.min(a.score / 100, 0.99),
  }));
}

// ── Log to Supabase ─────────────────────────────────────────────────────

async function logRouting(instruction, classification, matches, source) {
  const primary = matches[0] || {};
  const body = {
    instruction,
    instruction_type: classification.type,
    department: classification.department,
    priority: classification.priority,
    matched_agents: matches,
    primary_agent_id: primary.id || null,
    primary_agent_name: primary.name || null,
    routing_confidence: primary.confidence || 0,
    status: 'routed',
    source: source || 'command_center',
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/instruction_routing`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });

  return res.ok ? (await res.json())[0] : null;
}

// ── Trigger n8n Workflow ─────────────────────────────────────────────────

async function triggerN8n(routingRecord, n8nWebhookUrl) {
  if (!n8nWebhookUrl) return null;

  try {
    const res = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_id: routingRecord.id,
        instruction: routingRecord.instruction,
        type: routingRecord.instruction_type,
        department: routingRecord.department,
        priority: routingRecord.priority,
        primary_agent: routingRecord.primary_agent_name,
        matched_agents: routingRecord.matched_agents,
      }),
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    console.error('n8n trigger failed:', e.message);
    return null;
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Anthropic-Key, X-N8N-Webhook');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { instruction, source, anthropic_key, n8n_webhook_url } = req.body || {};
  
  if (!instruction) {
    return res.status(400).json({ error: 'Missing instruction' });
  }

  // Use provided key or fallback to header
  const apiKey = anthropic_key || req.headers['x-anthropic-key'];
  if (!apiKey) {
    return res.status(400).json({ error: 'Missing Anthropic API key. Set it in Command Center settings.' });
  }

  try {
    // Step 1: Classify the instruction
    const classification = await classifyInstruction(instruction, apiKey);

    // Step 2: Match agents
    const matches = await matchAgents(classification);

    // Step 3: Log to Supabase
    const record = await logRouting(instruction, classification, matches, source);

    // Step 4: Trigger n8n if webhook URL provided
    const n8nUrl = n8n_webhook_url || req.headers['x-n8n-webhook'];
    let n8nResult = null;
    if (n8nUrl && record) {
      n8nResult = await triggerN8n(record, n8nUrl);
    }

    return res.status(200).json({
      success: true,
      routing_id: record?.id,
      classification,
      matched_agents: matches,
      primary_agent: matches[0] || null,
      n8n_triggered: !!n8nResult,
      record,
    });

  } catch (err) {
    console.error('Routing error:', err);
    return res.status(500).json({ error: err.message });
  }
}
