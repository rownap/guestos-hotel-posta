// Supabase Configuration
const supabaseUrl = 'https://gqqgotvbabgxztrxbozu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxcWdvdHZiYWJneHp0cnhib3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODM4MjgsImV4cCI6MjA4NDY1OTgyOH0.gFc_bLefoFuVW21MSMEg30CD97bFfVeHEQDhkfe_2QY';
// OpenWeather API
const OPENWEATHER_API_KEY = 'dcc0590743a5a15df1e33e71e3e17786'; // Sostituisci con la tua key
const HOTEL_LOCATION = {
    lat: 39.2, // Calabria
    lon: 16.25,
    name: 'Calabria'
};
// Initialize Supabase client
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseClient };
}




