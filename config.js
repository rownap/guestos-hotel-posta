// Supabase Configuration
const supabaseUrl = 'https://gqqgotvbabgxztrxbozu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxcWdvdHZiYWJneHp0cnhib3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODM4MjgsImV4cCI6MjA4NDY1OTgyOH0.gFc_bLefoFuVW21MSMEg30CD97bFfVeHEQDhkfe_2QY';

// Expose globally for payment-handler.js
window.SUPABASE_URL = supabaseUrl;
window.SUPABASE_ANON_KEY = supabaseKey;

// Stripe Configuration (Test Mode)
window.STRIPE_CONFIG = {
    publishableKey: 'pk_test_51StnONHUN0i0EWs7hqtFCmLrbWxttr4V19KbXOYiEEQ5KS5C3HPczvMnaogddEBdzAjpjyGCx1Cv2nA3pmbqFZnY00aoDYTYUy',
    createCheckoutSessionUrl: 'https://gqqgotvbabgxztrxbozu.supabase.co/functions/v1/create-checkout-session',
    successUrl: window.location.origin + '/payment-success.html',
    cancelUrl: window.location.origin + '/lastminute.html?canceled=true',
    supabaseAnonKey: supabaseKey // For convenience in payment-handler.js
};
// Alias for backward compatibility
window.STRIPE_CONFIG.createPaymentIntentUrl = window.STRIPE_CONFIG.createCheckoutSessionUrl;
const STRIPE_CONFIG = window.STRIPE_CONFIG;

// Weather widget is loaded via weatherwidget.io; keep this empty unless a private backend proxy is added.
const OPENWEATHER_API_KEY = '';
const HOTEL_LOCATION = {
    lat: 39.2, // Calabria
    lon: 16.25,
    name: 'Calabria'
};
// Initialize Supabase client
window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
var supabaseClient = window.supabaseClient; // Fallback for direct usage

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseClient };
}



