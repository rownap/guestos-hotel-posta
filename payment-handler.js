// payment-handler.js
// Pagamenti con carta tramite Stripe Checkout (pagina ospitata da Stripe).
//
// Flusso: il browser chiede alla Vercel Function /api/create-checkout-session di
// creare la sessione, poi viene rediretto su Stripe. Al termine Stripe chiama
// /api/stripe-webhook, che è l'UNICO punto in cui la prenotazione viene marcata
// come pagata e la riga in `payments` viene scritta. Il browser non scrive nulla
// sul database: con la RLS attiva non potrebbe comunque.
//
// Uso:
//   const handler = new PaymentHandler();
//   await handler.processPaymentWithCheckout({
//       amount: 55, itemType: 'tour', itemName: 'Giro delle Isole',
//       itemDescription: 'Escursione in barca', userEmail, userName,
//       bookingKind: 'tour', bookingId: 123, cancelPath: '/tours.html'
//   });

(function () {
    'use strict';

    var CHECKOUT_URL = '/api/create-checkout-session';

    function config() {
        return window.STRIPE_CONFIG || {};
    }

    function PaymentHandler() {
        // Nessuna inizializzazione necessaria: Stripe Checkout è una redirezione.
        // Stripe.js non serve più (era usato solo dal percorso Payment Element, rimosso).
    }

    /**
     * Crea la sessione di pagamento e redirige l'ospite su Stripe.
     * @param {Object} paymentData
     * @param {number} paymentData.amount        importo in euro
     * @param {string} paymentData.itemType      'tour' | 'restaurant' | 'spa' | 'last_minute' | 'room_service'
     * @param {string} paymentData.itemName
     * @param {string} [paymentData.itemDescription]
     * @param {string} paymentData.userEmail
     * @param {string} [paymentData.userName]
     * @param {string} [paymentData.bookingKind] tabella della prenotazione da confermare
     * @param {number|string} [paymentData.bookingId]
     * @param {string} [paymentData.cancelPath]  percorso locale su cui tornare se annulla
     * @param {Object} [paymentData.metadata]
     * @returns {Promise<{success:boolean, error?:string}>}
     */
    PaymentHandler.prototype.processPaymentWithCheckout = async function (paymentData) {
        paymentData = paymentData || {};

        var amount = Number(paymentData.amount);
        if (!isFinite(amount) || amount <= 0) {
            this.showError('Importo non valido.');
            return { success: false, error: 'invalid_amount' };
        }

        this.showLoadingState(true);

        try {
            var response = await fetch(CHECKOUT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amount,
                    itemType: paymentData.itemType,
                    itemName: paymentData.itemName,
                    itemDescription: paymentData.itemDescription || paymentData.itemName,
                    userEmail: paymentData.userEmail,
                    userName: paymentData.userName,
                    bookingKind: paymentData.bookingKind || paymentData.itemType,
                    bookingId: paymentData.bookingId,
                    cancelPath: paymentData.cancelPath || window.location.pathname,
                    metadata: paymentData.metadata || {}
                })
            });

            var data = {};
            try { data = await response.json(); } catch (e) { data = {}; }

            if (!response.ok || !data.url) {
                var msg = data.error || 'Non è stato possibile avviare il pagamento.';
                this.showLoadingState(false);
                this.showError(msg);
                return { success: false, error: msg };
            }

            // Redirezione verso la pagina di pagamento di Stripe.
            window.location.href = data.url;
            return { success: true };
        } catch (error) {
            this.showLoadingState(false);
            this.showError('Connessione non riuscita. Controlla la rete e riprova.');
            return { success: false, error: 'network_error' };
        }
    };

    PaymentHandler.prototype.showLoadingState = function (isLoading) {
        var existing = document.getElementById('payment-loading-overlay');

        if (!isLoading) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return;

        var overlay = document.createElement('div');
        overlay.id = 'payment-loading-overlay';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(5px);' +
            'display:flex;align-items:center;justify-content:center;z-index:10000;';

        var box = document.createElement('div');
        box.style.cssText =
            'background:#fff;padding:36px 40px;border-radius:20px;text-align:center;' +
            'box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:Poppins,system-ui,sans-serif;';

        var icon = document.createElement('div');
        icon.textContent = '💳';
        icon.style.cssText = 'font-size:44px;margin-bottom:16px;';

        var title = document.createElement('div');
        title.textContent = 'Ti porto al pagamento sicuro…';
        title.style.cssText = 'font-size:19px;font-weight:800;color:#222;margin-bottom:8px;';

        var sub = document.createElement('div');
        sub.textContent = 'Non chiudere questa pagina.';
        sub.style.cssText = 'font-size:14px;color:#888;font-weight:600;';

        box.appendChild(icon);
        box.appendChild(title);
        box.appendChild(sub);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    };

    PaymentHandler.prototype.showError = function (message) {
        alert('Pagamento non riuscito.\n\n' + (message || '') +
              '\n\nPuoi riprovare oppure completare la prenotazione alla reception.');
    };

    function formatAmount(amount) {
        try {
            return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
        } catch (e) {
            return '€' + Number(amount || 0).toFixed(2);
        }
    }

    window.PaymentHandler = PaymentHandler;
    window.formatAmount = formatAmount;
    // Compatibilità: config().createCheckoutSessionUrl resta letto da config.js,
    // ma il percorso reale è sempre /api/create-checkout-session.
    if (config().createCheckoutSessionUrl && config().createCheckoutSessionUrl !== CHECKOUT_URL) {
        console.warn('STRIPE_CONFIG.createCheckoutSessionUrl ignorato: si usa ' + CHECKOUT_URL);
    }
})();
