// InsightProfit Mission Control — Live Data Layer
// Connects the dashboard to Supabase for real-time enterprise metrics
// Add to index.html via <script src="enterprise-api.js"></script>

const ENTERPRISE_API = {
  supabaseUrl: 'https://supabase.insightprofit.live',
  // Anon key — safe for client-side (RLS protects data)
  supabaseKey: localStorage.getItem('supabase_anon_key') || '',

  headers() {
    return {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
    };
  },

  // ── Agent Fleet ──────────────────────────────────────

  async getAgents() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_agents?order=updated_at.desc`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getAgentsByStatus(status) {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_agents?status=eq.${status}`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Tasks ────────────────────────────────────────────

  async getActiveTasks() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_tasks?status=in.(queued,running)&order=created_at.desc&limit=50`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getStalledTasks() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_tasks?status=eq.running&started_at=lt.${oneHourAgo}`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getRecentTasks(limit = 20) {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_tasks?order=created_at.desc&limit=${limit}`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Metrics ──────────────────────────────────────────

  async getDailyCost(date) {
    const d = date || new Date().toISOString().split('T')[0];
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/rpc/daily_cost_summary`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ p_date: d }),
      }
    );
    return res.ok ? res.json() : {};
  },

  async getTokenUsageByDept() {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_tasks?select=department,tokens_total,estimated_cost&created_at=gte.${today}T00:00:00`,
      { headers: this.headers() }
    );
    if (!res.ok) return {};
    const tasks = await res.json();
    const byDept = {};
    for (const t of tasks) {
      const dept = t.department || 'Unknown';
      if (!byDept[dept]) byDept[dept] = { tokens: 0, cost: 0, tasks: 0 };
      byDept[dept].tokens += t.tokens_total || 0;
      byDept[dept].cost += parseFloat(t.estimated_cost) || 0;
      byDept[dept].tasks += 1;
    }
    return byDept;
  },

  // ── Knowledge Base ───────────────────────────────────

  async searchKB(query) {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/rpc/search_knowledge`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ query, max_results: 10 }),
      }
    );
    return res.ok ? res.json() : [];
  },

  async getKBStats() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_knowledge?select=category`,
      { headers: this.headers() }
    );
    if (!res.ok) return {};
    const entries = await res.json();
    const byCategory = {};
    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    }
    return { total: entries.length, byCategory };
  },

  // ── Integration Health ───────────────────────────────

  async getIntegrations() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/enterprise_integrations?order=name`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Dashboard Refresh ────────────────────────────────

  async refreshAll() {
    const [agents, activeTasks, stalledTasks, cost, integrations] = await Promise.all([
      this.getAgents(),
      this.getActiveTasks(),
      this.getStalledTasks(),
      this.getDailyCost(),
      this.getIntegrations(),
    ]);
    return { agents, activeTasks, stalledTasks, cost, integrations };
  },

  // ── Config ───────────────────────────────────────────

  configure(anonKey) {
    this.supabaseKey = anonKey;
    localStorage.setItem('supabase_anon_key', anonKey);
  },
};

// Auto-refresh every 30 seconds if dashboard is open
if (typeof window !== 'undefined') {
  window.ENTERPRISE_API = ENTERPRISE_API;
  console.log('[Mission Control] Enterprise API loaded. Call ENTERPRISE_API.configure("your-anon-key") to connect.');
}