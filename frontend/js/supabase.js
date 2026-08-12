const SUPABASE_URL = "https://mnhszkqbtxqvzntusmxp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gVPcn3AyRRNxj1yGV54vNw_Y5_av5m-";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

window.client = client;

console.log(client);

