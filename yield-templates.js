/**
 * YIELD MANAGEMENT — template di offerta lampo.
 *
 * I template scrivevano su `dealTitle` e `dealDesc`, due id che nel modale non
 * esistono: il click non faceva nulla. Ora scrivono sui campi veri:
 *   #fd-service  #fd-discount  #fd-duration  #fd-headline
 * Il servizio 'tours' dei vecchi template viene mappato su 'tour', che e' il
 * valore reale della <option> e della colonna flash_deals.service_type.
 */
(function () {
    'use strict';

    const TEMPLATES = {
        spa_rain: {
            label: 'Rainy Day Relax',
            service: 'spa',
            discount: 30,
            duration: 60,
            headline: '🌨️ Fuori piove? Riscaldati in Spa! Solo per questo pomeriggio: '
                + 'massaggio relax da 50 minuti al {n}% di sconto. Posti limitati.'
        },
        tour_last: {
            label: 'Ultimi posti: Giro delle Isole',
            service: 'tours',           // -> normalizzato a 'tour'
            discount: 40,
            duration: 60,
            headline: '🚢 Domani si parte! Restano solo 2 posti per il tour in barca: '
                + 'prenota ora con il {n}% di sconto.'
        },
        dinner_promo: {
            label: 'Cena romantica vista mare',
            service: 'restaurant',
            discount: 25,
            duration: 30,
            headline: '🍽️ Si e\' appena liberato un tavolo vista mare! '
                + 'Menu degustazione completo al {n}% di sconto, solo per stasera.'
        },
        late_checkout: {
            label: 'Late check-out',
            service: 'spa',             // non esiste un servizio "camera": resta in Spa & Relax
            discount: 50,
            duration: 60,
            headline: '🛌 Non scappare via! Tieni la camera fino alle 14:00 '
                + 'con il {n}% di sconto e goditi l\'ultima mattina con calma.'
        }
    };

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return false;
        el.value = String(value);
        return true;
    }

    function useTemplate(templateId) {
        const tpl = TEMPLATES[templateId];
        if (!tpl) {
            console.warn('Template sconosciuto:', templateId);
            return;
        }

        if (typeof window.openFlashDealModal === 'function') window.openFlashDealModal();

        const service = typeof window.normalizeFlashDealService === 'function'
            ? window.normalizeFlashDealService(tpl.service)
            : tpl.service;

        setValue('fd-service', service);
        setValue('fd-discount', tpl.discount);
        setValue('fd-duration', tpl.duration);

        const headline = document.getElementById('fd-headline');
        if (headline) {
            headline.value = tpl.headline.replace('{n}', String(tpl.discount));
            // Blocca la riscrittura automatica dell'anteprima: il testo e' voluto.
            headline.dataset.touched = '1';
        }

        if (typeof window.loadHeadlineHistory === 'function') window.loadHeadlineHistory();
        showToast('Template "' + tpl.label + '" applicato');
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#333; color:white;'
            + ' padding:12px 24px; border-radius:10px; z-index:10000; font-weight:700; font-size:14px;'
            + ' box-shadow:0 8px 24px rgba(0,0,0,0.3);';
        toast.textContent = message;   // textContent: nessun HTML iniettato
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    window.useTemplate = useTemplate;
    window.showToast = showToast;
    window.YIELD_TEMPLATES = TEMPLATES;
})();
