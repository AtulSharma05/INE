const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

// Auto-fix: if user accidentally pasted the Supabase Dashboard/Studio URL
// e.g. https://supabase.com/dashboard/project/xyz
const dashboardMatch = rawUrl.match(/dashboard\/project\/([a-zA-Z0-9_-]+)/);
if (dashboardMatch) {
  rawUrl = `https://${dashboardMatch[1]}.supabase.co`;
}

let supabase = null;

if (rawUrl && supabaseKey && !rawUrl.includes('your-project')) {
  supabase = createClient(rawUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
} else {
  console.warn(
    '⚠️ Supabase credentials not configured or using placeholder. Running in fallback/unconnected mode.'
  );
}

module.exports = { supabase };
