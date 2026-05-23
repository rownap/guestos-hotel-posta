
// YIELD MANAGEMENT TEMPLATES LOGIC
function useTemplate(templateId) {
    // Open modal if not open
    openFlashDealModal();

    let title = "";
    let description = "";
    let service = "";
    let discount = 0; // percentage to suggest

    switch (templateId) {
        case 'spa_rain':
            title = "🌨️ Rainy Day Relax - Massaggio";
            description = "Fuori piove? Riscaldati in SPA! Offerta esclusiva per questo pomeriggio: Massaggio Relax 50min scontato.";
            service = "spa";
            discount = 30;
            break;
        case 'tour_last':
            title = "🚢 Ultimi Posti: Giro delle Isole";
            description = "Domani si parte! Sono rimasti solo 2 posti per il tour in barca. Prenota ora con uno sconto speciale.";
            service = "tours";
            discount = 40;
            break;
        case 'dinner_promo':
            title = "🍽️ Cena Romantica Vista Mare";
            description = "Un tavolo esclusivo si è appena liberato! Approfitta del Menu Degustazione completo a prezzo ridotto.";
            service = "restaurant";
            discount = 25;
            break;
        case 'late_checkout':
            title = "🛌 Late Check-out Special";
            description = "Non scappare via! Tieni la tua camera fino alle 14:00 e goditi l'ultima mattina con calma.";
            service = "room"; // Assuming room service mapping exist or general
            discount = 50;
            break;
    }

    // Populate fields
    if (document.getElementById('dealTitle')) document.getElementById('dealTitle').value = title;
    if (document.getElementById('dealDesc')) document.getElementById('dealDesc').value = description;

    // Simulate setting service (might need adjustment based on your select ID)
    // document.getElementById('dealService').value = service; 

    // Suggest prices (mock calculation logic as we don't know original price yet)
    // Warning: User still needs to set prices manually or we need logic to fetch base price

    // Toast notification
    showToast(`Template "${title}" applicato!`);
}

function showToast(message) {
    // Basic toast implementation if not exists
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#333';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '10000';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}
