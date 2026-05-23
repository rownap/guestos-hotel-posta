/**
 * GUESTOS PAYMENT HANDLER
 * Centralized Stripe payment management
 * 
 * Usage:
 *   import { PaymentHandler } from './payment-handler.js';
 *   const handler = new PaymentHandler();
 *   await handler.processPayment({ amount: 55, itemType: 'tour', ... });
 */

// ==========================================
// CONFIGURATION - Defined in config.js
// ==========================================

// If STRIPE_CONFIG is not defined globally, provide a fallback (optional)
if (typeof window.STRIPE_CONFIG === 'undefined') {
    window.STRIPE_CONFIG = {
        publishableKey: 'pk_test_YOUR_KEY_HERE',
        createCheckoutSessionUrl: '/functions/v1/create-checkout-session',
        successUrl: window.location.origin + '/payment-success.html',
        cancelUrl: window.location.origin + '/payment-cancel.html',
    };
}

// ==========================================
// PAYMENT HANDLER CLASS
// ==========================================

class PaymentHandler {
    constructor() {
        this.stripe = null;
        this.supabase = null;
        this.init();
    }

    async init() {
        console.log('💳 Initializing PaymentHandler...');
        // Load Stripe.js if not already loaded
        if (!window.Stripe) {
            await this.loadStripeJS();
        }

        const config = window.STRIPE_CONFIG;
        if (!config || !config.publishableKey || config.publishableKey.includes('YOUR_KEY')) {
            console.error('❌ STRIPE_CONFIG is missing or invalid in config.js');
        }

        this.stripe = Stripe(config.publishableKey);
        console.log('✅ Stripe initialized');

        // Get Supabase client from global (assumes config.js loaded)
        if (window.supabaseClient) {
            this.supabase = window.supabaseClient;
        } else {
            console.error('❌ Supabase client not found. Make sure config.js is loaded.');
        }
    }

    /**
     * Dynamically load Stripe.js
     */
    loadStripeJS() {
        return new Promise((resolve, reject) => {
            if (window.Stripe) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Main payment processing method
     * 
     * @param {Object} paymentData
     * @param {number} paymentData.amount - Amount in EUR
     * @param {string} paymentData.itemType - 'tour', 'restaurant', 'spa', 'last_minute'
     * @param {string} paymentData.itemId - UUID of item
     * @param {string} paymentData.itemName - Display name
     * @param {string} paymentData.itemDescription - Description
     * @param {string} paymentData.userEmail - User email
     * @param {string} paymentData.userName - User name
     * @param {Object} paymentData.metadata - Additional metadata
     * 
     * @returns {Promise<Object>} Payment result
     */
    async processPayment(paymentData) {
        try {
            console.log('💳 Processing payment:', paymentData);

            // Validate input
            if (!paymentData.amount || paymentData.amount <= 0) {
                throw new Error('Invalid amount');
            }

            // Show loading state
            this.showLoadingState(true);

            // Step 1: Create payment intent via backend
            const { clientSecret, paymentIntentId } = await this.createPaymentIntent(paymentData);

            // Step 2: Confirm payment with Stripe Checkout
            const result = await this.confirmPayment(clientSecret, paymentData);

            // Step 3: Save payment record to database
            if (result.success) {
                await this.savePaymentRecord({
                    ...paymentData,
                    stripePaymentIntentId: paymentIntentId,
                    status: 'succeeded'
                });
            }

            this.showLoadingState(false);
            return result;

        } catch (error) {
            console.error('❌ Payment error:', error);
            this.showLoadingState(false);
            this.showError(error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create payment intent on backend
     */
    async createPaymentIntent(paymentData) {
        try {
            // Call Supabase Edge Function
            const response = await fetch(STRIPE_CONFIG.createPaymentIntentUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: paymentData.amount,
                    currency: 'eur',
                    description: `${paymentData.itemName} - ${paymentData.itemDescription}`,
                    metadata: {
                        itemType: paymentData.itemType,
                        itemId: paymentData.itemId,
                        userEmail: paymentData.userEmail,
                        userName: paymentData.userName,
                        ...paymentData.metadata
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create payment intent');
            }

            const data = await response.json();
            return {
                clientSecret: data.clientSecret,
                paymentIntentId: data.paymentIntentId
            };

        } catch (error) {
            console.error('Error creating payment intent:', error);
            throw new Error('Unable to initialize payment. Please try again.');
        }
    }

    /**
     * Confirm payment using Stripe Checkout
     */
    async confirmPayment(clientSecret, paymentData) {
        try {
            // Use Stripe Payment Element or redirect to Checkout
            const { error } = await this.stripe.confirmPayment({
                clientSecret,
                confirmParams: {
                    return_url: STRIPE_CONFIG.successUrl +
                        `?type=${paymentData.itemType}&id=${paymentData.itemId}`,
                },
            });

            if (error) {
                throw new Error(error.message);
            }

            return { success: true };

        } catch (error) {
            console.error('Payment confirmation error:', error);
            throw error;
        }
    }

    /**
     * Alternative: Use Stripe Checkout Session (simpler, hosted page)
     * This is the RECOMMENDED method for GuestOS
     */
    async processPaymentWithCheckout(paymentData) {
        try {
            console.log('💳 Creating Stripe Checkout session...');
            this.showLoadingState(true);

            // Create checkout session via Supabase Edge Function
            const response = await fetch(STRIPE_CONFIG.createCheckoutSessionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify(paymentData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create checkout session');
            }

            const { url } = await response.json();

            if (!url) {
                throw new Error('No checkout URL received');
            }

            // Redirect to Stripe Checkout
            window.location.href = url;

            return { success: true };

        } catch (error) {
            console.error('Checkout error:', error);
            this.showLoadingState(false);
            this.showError(error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save payment record to Supabase
     */
    async savePaymentRecord(paymentData) {
        try {
            const { data, error } = await this.supabase
                .from('payments')
                .insert([{
                    stripe_payment_intent_id: paymentData.stripePaymentIntentId,
                    user_email: paymentData.userEmail,
                    user_name: paymentData.userName,
                    amount: paymentData.amount,
                    currency: 'eur',
                    status: paymentData.status,
                    item_type: paymentData.itemType,
                    item_id: paymentData.itemId,
                    item_name: paymentData.itemName,
                    item_description: paymentData.itemDescription,
                    metadata: paymentData.metadata || {}
                }])
                .select();

            if (error) {
                console.error('Error saving payment:', error);
                throw error;
            }

            console.log('✅ Payment saved to database:', data);
            return data[0];

        } catch (error) {
            console.error('Database error:', error);
            // Don't throw - payment succeeded even if DB save failed
            return null;
        }
    }

    /**
     * Get payment status from Stripe
     */
    async getPaymentStatus(paymentIntentId) {
        try {
            const response = await fetch(`/functions/v1/get-payment-status?id=${paymentIntentId}`);
            const data = await response.json();
            return data.status;
        } catch (error) {
            console.error('Error fetching payment status:', error);
            return 'unknown';
        }
    }

    /**
     * UI Helper: Show loading state
     */
    showLoadingState(isLoading) {
        const existingOverlay = document.getElementById('payment-loading-overlay');

        if (isLoading) {
            if (!existingOverlay) {
                const overlay = document.createElement('div');
                overlay.id = 'payment-loading-overlay';
                overlay.innerHTML = `
                    <div style="
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0,0,0,0.7);
                        backdrop-filter: blur(5px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                    ">
                        <div style="
                            background: white;
                            padding: 40px;
                            border-radius: 20px;
                            text-align: center;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        ">
                            <div style="font-size: 48px; margin-bottom: 20px;">💳</div>
                            <div style="font-size: 20px; font-weight: 800; color: #333; margin-bottom: 10px;">
                                Elaborazione pagamento...
                            </div>
                            <div style="font-size: 14px; color: #999;">
                                Attendi qualche secondo
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
            }
        } else {
            if (existingOverlay) {
                existingOverlay.remove();
            }
        }
    }

    /**
     * UI Helper: Show error
     */
    showError(message) {
        alert(`❌ Errore nel pagamento:\n${message}\n\nRiprova o contatta la reception.`);
    }

    /**
     * UI Helper: Show success
     */
    showSuccess(message) {
        alert(`✅ ${message || 'Pagamento completato con successo!'}`);
    }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Format amount for display
 */
function formatAmount(amount) {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

/**
 * Quick payment button helper
 * Add this to any button: onclick="quickPay(55, 'tour', 'tour-123', 'Giro Isole')"
 */
async function quickPay(amount, itemType, itemId, itemName) {
    const handler = new PaymentHandler();

    // Get user info from localStorage
    const userEmail = localStorage.getItem('user_email') || 'guest@hotel.com';
    const userName = localStorage.getItem('user_name') || 'Guest User';

    const result = await handler.processPayment({
        amount,
        itemType,
        itemId,
        itemName,
        itemDescription: `Acquisto ${itemName}`,
        userEmail,
        userName
    });

    if (result.success) {
        handler.showSuccess();
        // Redirect or update UI
        setTimeout(() => {
            window.location.href = '/account.html?tab=payments';
        }, 2000);
    }
}

// ==========================================
// EXPORT
// ==========================================

// Make available globally
window.PaymentHandler = PaymentHandler;
window.quickPay = quickPay;
window.formatAmount = formatAmount;

console.log('✅ Payment Handler loaded');
