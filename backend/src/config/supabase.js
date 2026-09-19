const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
} else {
  console.warn(
    '⚠️ Supabase credentials not configured or using placeholder. Running in fallback/unconnected mode until credentials are provided in .env'
  );
}

module.exports = { supabase };
