// InsightProfit Instruction Router — History API
// Returns recent routing records for the dashboard

const SUPABASE_URL = 'https://supabase.insightprofit.live';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY2ODcxMjQ0LCJleHAiOjIwODIyMzEyNDR9.qtJF1pWQQr-SGHVYLv0wP4hMiamqfjrNsfsnBm-c2hI';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const limit = parseInt(req.query.limit || '20', 10);
  const status = req.query.status; // optional filter

  let url = `${SUPABASE_URL}/rest/v1/instruction_routing?order=created_at.desc&limit=${limit}`;
  if (status) url += `&status=eq.${status}`;

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    return res.status(500).json({ error: 'Failed to fetch routing history' });
  }

  const records = await response.json();
  
  // Also get stats
  const statsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/instruction_routing?select=status,instruction_type`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  
  let stats = { total: 0, byStatus: {}, byType: {} };
  if (statsRes.ok) {
    const all = await statsRes.json();
    stats.total = all.length;
    for (const r of all) {
      stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
      stats.byType[r.instruction_type] = (stats.byType[r.instruction_type] || 0) + 1;
    }
  }

  return res.status(200).json({ records, stats });
}
