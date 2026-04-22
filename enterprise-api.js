// InsightProfit Mission Control — Enterprise Dashboard API v3
// ETL-powered analytics from Supabase
// Pipelines: ClickUp sync (15min), Agent metrics (1h), KB analytics (daily), Infra metrics (1h), Revenue (6h)

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

  // ── Dashboard KPIs (single RPC call) ─────────────────
  async getKPIs() {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/rest/v1/rpc/get_dashboard_kpis`,
        { method: 'POST', headers: this.headers(), body: '{}' }
      );
      return res.ok ? res.json() : {};
    } catch(e) { return {}; }
  },

  // ── Agent Fleet ──────────────────────────────────────
  async getAgents() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/agents?order=name`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getAgentPerformance() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/v_agent_performance?order=today_executions.desc`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getAgentSummary() {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/rest/v1/rpc/get_agent_summary`,
        { method: 'POST', headers: this.headers(), body: '{}' }
      );
      return res.ok ? res.json() : [];
    } catch(e) { return []; }
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

  // ── Token Usage & Cost Trends ────────────────────────
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

  async getCostTrends(days = 7) {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/rest/v1/rpc/get_cost_trends`,
        { method: 'POST', headers: this.headers(), body: JSON.stringify({ days }) }
      );
      return res.ok ? res.json() : [];
    } catch(e) { return []; }
  },

  // ── Infrastructure Health ────────────────────────────
  async getInfraStatus() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/infra_current_status?order=service`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getInfraHealth() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/v_infra_health`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getInfraMetrics() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/infra_metrics?order=metric_date.desc&limit=7`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Project Velocity (ClickUp) ───────────────────────
  async getProjectVelocity() {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/rest/v1/rpc/get_project_velocity`,
        { method: 'POST', headers: this.headers(), body: '{}' }
      );
      return res.ok ? res.json() : [];
    } catch(e) { return []; }
  },

  async getProjectHealth() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/v_project_health`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getClickUpTasks(limit = 50) {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/clickup_tasks?order=updated_at.desc&limit=${limit}`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Revenue Analytics ────────────────────────────────
  async getRevenueOverview() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/v_revenue_overview`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  async getRevenueAnalytics(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/revenue_analytics?period_date=gte.${since}&order=period_date.desc`,
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

  async getKBAnalytics() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/v_kb_coverage`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── ETL Pipeline Status ──────────────────────────────
  async getETLStatus() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/etl_runs?order=started_at.desc&limit=20`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Daily Operations Summary ─────────────────────────
  async getDailySummary() {
    const res = await fetch(
      `${this.supabaseUrl}/rest/v1/v_daily_ops_summary`,
      { headers: this.headers() }
    );
    return res.ok ? res.json() : [];
  },

  // ── Full Dashboard Refresh ───────────────────────────
  async refreshAll() {
    const [kpis, agents, agentPerf, activeSessions, stalledSessions, recentSessions, deptStats, tokens, costTrends, infra, infraMetrics, projects, revenue, kb, kbAnalytics, etlStatus] = await Promise.allSettled([
      this.getKPIs(),
      this.getAgents(),
      this.getAgentPerformance(),
      this.getActiveSessions(),
      this.getStalledSessions(),
      this.getRecentSessions(),
      this.getSessionsByDepartment(),
      this.getTodayTokens(),
      this.getCostTrends(),
      this.getInfraHealth(),
      this.getInfraMetrics(),
      this.getProjectVelocity(),
      this.getRevenueOverview(),
      this.getKBStats(),
      this.getKBAnalytics(),
      this.getETLStatus(),
    ]);

    const v = (p) => p.status === 'fulfilled' ? p.value : (p.status === 'fulfilled' ? p.value : null);
    return {
      kpis: v(kpis),
      agents: v(agents),
      agentPerformance: v(agentPerf),
      activeSessions: v(activeSessions),
      stalledSessions: v(stalledSessions),
      recentSessions: v(recentSessions),
      deptStats: v(deptStats),
      tokens: v(tokens),
      costTrends: v(costTrends),
      infra: v(infra),
      infraMetrics: v(infraMetrics),
      projects: v(projects),
      revenue: v(revenue),
      kb: v(kb),
      kbAnalytics: v(kbAnalytics),
      etlStatus: v(etlStatus),
    };
  },

  // ── Config ───────────────────────────────────────────
  configure(anonKey) {
    this.supabaseKey = anonKey;
    localStorage.setItem('supabase_anon_key', anonKey);
  },
};

// Auto-refresh loop (every 30s)
if (typeof window !== 'undefined') {
  window.ENTERPRISE_API = ENTERPRISE_API;
  setInterval(async () => {
    if (window._enterpriseDashboardActive) {
      const data = await ENTERPRISE_API.refreshAll();
      if (window._onEnterpriseRefresh) window._onEnterpriseRefresh(data);
    }
  }, 30000);
  console.log('[Mission Control] Enterprise API v3 loaded — ETL-powered analytics.');
  console.log('  Pipelines: ClickUp (15min) | Agent metrics (1h) | Infra (1h) | KB (daily) | Revenue (6h)');
}
