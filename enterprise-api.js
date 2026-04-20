// InsightProfit Mission Control — Enterprise Dashboard API v2
// Connects to EXISTING Supabase tables for live data
// Tables: agents, dispatch_sessions, token_usage, infra_current_status, knowledge_items

const ENTERPRISE_API = {
  supabaseUrl: 'https://supabase.insightprofit.live',
  supabaseKey: localStorage.getItem('supabase_anon_key') || '',

  headers() {
    return {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
    };
  },

  // ── Agent Fleet (15 registered agents) ───────────────

  async getAgents() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/agents?order=name`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Dispatch Sessions ────────────────────────────────

  async getActiveSessions() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/dispatch_sessions?status=in.(running,pending,in_progress)&order=updated_at.desc`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getStalledSessions() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/dispatch_sessions?status=in.(running,pending,in_progress)&updated_at=lt.${oneHourAgo}`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getRecentSessions(limit = 20) {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/dispatch_sessions?order=updated_at.desc&limit=${limit}`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getSessionsByDepartment() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/dispatch_sessions?select=department,status`,
      { headers: this.headers() }
    );
    if (!res.ok) return {};
    const sessions = await res.json();
    const byDept = {};
    for (const s of sessions) {
      const d = s.department || 'Unassigned';
      if (!byDept[d]) byDept[d] = { total: 0, completed: 0, running: 0, failed: 0 };
      byDept[d].total++;
      byDept[d][s.status] = (byDept[d][s.status] || 0) + 1;
    }
    return byDept;
  },

  // ── Token Usage ──────────────────────────────────────

  async getTodayTokens() {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/token_usage?created_at=gte.${today}T00:00:00`,
      { headers: this.headers() }
    );
    if (!res.ok) return { total: 0, cost: 0, calls: 0, byModel: {} };
    const rows = await res.json();
    const byModel = {};
    for (const r of rows) {
      const m = r.model || 'unknown';
      if (!byModel[m]) byModel[m] = { tokens: 0, cost: 0, calls: 0 };
      byModel[m].tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      byModel[m].cost += parseFloat(r.estimated_cost_usd || 0);
      byModel[m].calls += 1;
    }
    return {
      total: rows.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0),
      cost: rows.reduce((s, r) => s + parseFloat(r.estimated_cost_usd || 0), 0),
      calls: rows.length,
      byModel,
    };
  },

  // ── Infrastructure Health ────────────────────────────

  async getInfraStatus() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/infra_current_status?order=service`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Knowledge Base Stats ─────────────────────────────

  async getKBStats() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/knowledge_items?select=item_type&status=eq.active`,
      { headers: this.headers() }
    );
    if (!res.ok) return { total: 0, byType: {} };
    const items = await res.json();
    const byType = {};
    for (const i of items) {
      byType[i.item_type] = (byType[i.item_type] || 0) + 1;
    }
    return { total: items.length, byType };
  },

  // ── Full Dashboard Refresh ───────────────────────────

  async refreshAll() {
    const [agents, activeSessions, stalledSessions, recentSessions, deptStats, tokens, infra, kb] = await Promise.all([
      this.getAgents(),
      this.getActiveSessions(),
      this.getStalledSessions(),
      this.getRecentSessions(),
      this.getSessionsByDepartment(),
      this.getTodayTokens(),
      this.getInfraStatus(),
      this.getKBStats(),
    ]);
    return { agents, activeSessions, stalledSessions, recentSessions, deptStats, tokens, infra, kb };
  },

  // ── Config ───────────────────────────────────────────

  configure(anonKey) {
    this.supabaseKey = anonKey;
    localStorage.setItem('supabase_anon_key', anonKey);
  },
};

// Auto-refresh loop
if (typeof window !== 'undefined') {
  window.ENTERPRISE_API = ENTERPRISE_API;
  setInterval(async () => {
    if (window._enterpriseDashboardActive) {
      const data = await ENTERPRISE_API.refreshAll();
      if (window._onEnterpriseRefresh) window._onEnterpriseRefresh(data);
    }
  }, 30000);
  console.log('[Mission Control] Enterprise API v2 loaded. Using existing Supabase tables.');
  console.log('  agents: 15 registered | knowledge_items: 11,590 entries | token_usage: live tracking');
}