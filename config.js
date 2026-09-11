// Supabase Configuration
//
// SICUREZZA: questa chiave è la anon key ed è pubblica per progetto (sta nel
// sorgente di ogni pagina). Non è un segreto: da sola non dà accesso ai dati.
// Tutto ciò che il browser può leggere o scrivere è deciso dalle policy RLS
// sul database (vedi supabase/migrations/) e dalle RPC SECURITY DEFINER.
// L'identità dell'ospite viaggia nell'header `x-guest-token`, quella
// dell'admin nella sessione Supabase Auth (o nell'header `x-admin-token`).
const supabaseUrl = 'https://gqqgotvbabgxztrxbozu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxcWdvdHZiYWJneHp0cnhib3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODM4MjgsImV4cCI6MjA4NDY1OTgyOH0.gFc_bLefoFuVW21MSMEg30CD97bFfVeHEQDhkfe_2QY';

// Expose globally for payment-handler.js
window.SUPABASE_URL = supabaseUrl;
window.SUPABASE_ANON_KEY = supabaseKey;

// Stripe Configuration (Test Mode)
window.STRIPE_CONFIG = {
    // PUBBLICA per design. PRIMA DEL GO-LIVE sostituire con la chiave pk_live_ della
    // struttura (Stripe -> Sviluppatori -> Chiavi API). La chiave segreta non va MAI qui:
    // sta solo nelle variabili d'ambiente Vercel (STRIPE_SECRET_KEY).
    publishableKey: window.STRIPE_PUBLISHABLE_KEY || 'pk_test_51StnONHUN0i0EWs7hqtFCmLrbWxttr4V19KbXOYiEEQ5KS5C3HPczvMnaogddEBdzAjpjyGCx1Cv2nA3pmbqFZnY00aoDYTYUy',
    // Vercel Function nel repo: api/create-checkout-session.js
    createCheckoutSessionUrl: '/api/create-checkout-session',
    successUrl: window.location.origin + '/payment-success.html',
    cancelUrl: window.location.origin + '/lastminute.html?canceled=true',
};
const STRIPE_CONFIG = window.STRIPE_CONFIG;

// Weather widget is loaded via weatherwidget.io; keep this empty unless a private backend proxy is added.
const OPENWEATHER_API_KEY = '';
const HOTEL_LOCATION = {
    lat: 39.2, // Calabria
    lon: 16.25,
    name: 'Calabria'
};

// Token di sessione ospite/admin letti da localStorage e inviati come header:
// le policy RLS li usano per capire chi sta chiamando. Se non ci sono, il
// client resta anonimo e vede solo i cataloghi pubblici.
function guestosSessionHeaders() {
    const headers = {};
    try {
        const guestToken = localStorage.getItem('guestos_token');
        if (guestToken) headers['x-guest-token'] = guestToken;
        const adminToken = localStorage.getItem('guestos_admin_token');
        if (adminToken) headers['x-admin-token'] = adminToken;
    } catch (e) {
        // localStorage non disponibile: nessun header, accesso anonimo
    }
    return headers;
}

// Initialize Supabase client
window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
    global: { headers: guestosSessionHeaders() }
});
var supabaseClient = window.supabaseClient; // Fallback for direct usage

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseClient };
}
