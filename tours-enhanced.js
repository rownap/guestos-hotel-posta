// ============================================
// TOURS PAGE - Filtering & Sorting
// ============================================

// Tours data (this will come from Supabase later)
const toursData = [
    {
        id: 1,
        name: "Giro delle Isole Incantate",
        description: "Tour in barca con pranzo e snorkeling",
        price: 55,
        duration: "8 ore",
        category: "mare",
        departure: "9:00",
        maxPeople: 12,
        rating: 4.9,
        featured: true,
        badge: "PIÙ VENDUTO"
    },
    {
        id: 2,
        name: "Tramonto in Barca a Vela",
        description: "Navigazione serale con aperitivo",
        price: 38,
        duration: "3 ore",
        category: "mare",
        departure: "18:00",
        maxPeople: 15,
        rating: 4.8,
        badge: "Sera"
    },
    {
        id: 3,
        name: "Tour Archeologico Guidato",
        description: "Visita ai siti con guida esperta e degustazione",
        price: 42,
        duration: "5 ore",
        category: "cultura",
        departure: "9:30",
        maxPeople: 20,
        rating: 4.7,
        badge: "Top"
    },
    {
        id: 4,
        name: "Tour Enogastronomico",
        description: "Cantine locali con degustazione vini e formaggi",
        price: 48,
        duration: "4 ore",
        category: "enogastronomia",
        departure: "10:00",
        maxPeople: 12,
        rating: 4.9,
        badge: "Nuovo"
    },
    {
        id: 5,
        name: "Trekking Panoramico",
        description: "Sentieri panoramici con picnic",
        price: 35,
        duration: "6 ore",
        category: "montagna",
        departure: "8:00",
        maxPeople: 18,
        rating: 4.6,
        badge: "Natura"
    },
    {
        id: 6,
        name: "Gita in Kayak",
        description: "Esplorazione costa in kayak",
        price: 45,
        duration: "3 ore",
        category: "mare",
        departure: "10:00",
        maxPeople: 10,
        rating: 4.8
    },
    {
        id: 7,
        name: "Tour Borghi Antichi",
        description: "Visita villaggi storici con pranzo tipico",
        price: 40,
        duration: "6 ore",
        category: "cultura",
        departure: "9:00",
        maxPeople: 16,
        rating: 4.7
    },
    {
        id: 8,
        name: "Escursione Cascate",
        description: "Trekking alle cascate nascoste",
        price: 32,
        duration: "4 ore",
        category: "montagna",
        departure: "9:30",
        maxPeople: 15,
        rating: 4.5
    }
];

// Current filters
let currentFilters = {
    category: 'all',
    minPrice: 0,
    maxPrice: 100,
    sortBy: 'featured' // featured, price-asc, price-desc, rating
};

// Initialize tours page
function initToursPage() {
    if (!document.querySelector('.filter-tabs')) return;
    
    setupFilterTabs();
    setupPriceFilter();
    setupSortDropdown();
    renderTours(toursData);
}

// Setup filter tabs
function setupFilterTabs() {
    const filterTabs = document.querySelectorAll('.filter-tab');
    
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Update active state
            filterTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Get category
            const text = this.textContent.trim().toLowerCase();
            let category = 'all';
            
            if (text.includes('mare')) category = 'mare';
            else if (text.includes('montagna')) category = 'montagna';
            else if (text.includes('cultura')) category = 'cultura';
            else if (text.includes('enogastronomia')) category = 'enogastronomia';
            
            // Update filter and re-render
            currentFilters.category = category;
            filterAndRenderTours();
        });
    });
}

// Setup price filter
function setupPriceFilter() {
    // Add price filter UI if it doesn't exist
    const filterTabs = document.querySelector('.filter-tabs');
    if (!filterTabs) return;
    
    // Check if already exists
    if (document.querySelector('.price-filter')) return;
    
    const priceFilterHTML = `
        <div class="price-filter">
            <button class="filter-tab price-btn" onclick="togglePriceFilter()">
                💰 Prezzo
            </button>
            <div class="price-dropdown" id="priceDropdown" style="display: none;">
                <div class="price-range">
                    <div class="price-input-group">
                        <label>Min: €<span id="minPriceValue">0</span></label>
                        <input type="range" id="minPrice" min="0" max="100" value="0" step="5">
                    </div>
                    <div class="price-input-group">
                        <label>Max: €<span id="maxPriceValue">100</span></label>
                        <input type="range" id="maxPrice" min="0" max="100" value="100" step="5">
                    </div>
                </div>
                <button class="apply-price-btn" onclick="applyPriceFilter()">Applica</button>
            </div>
        </div>
    `;
    
    // This will be added via CSS/HTML update
}

// Setup sort dropdown
function setupSortDropdown() {
    // Add sort UI if it doesn't exist
    const content = document.querySelector('.content');
    if (!content) return;
    
    // Check if already exists
    if (document.querySelector('.sort-section')) return;
    
    const sortHTML = `
        <div class="sort-section">
            <label class="sort-label">Ordina per:</label>
            <select class="sort-select" id="sortSelect" onchange="handleSortChange()">
                <option value="featured">In evidenza</option>
                <option value="price-asc">Prezzo: crescente</option>
                <option value="price-desc">Prezzo: decrescente</option>
                <option value="rating">Valutazione</option>
            </select>
        </div>
    `;
    
    // This will be added via HTML update
}

// Filter and render tours
function filterAndRenderTours() {
    let filtered = toursData;
    
    // Filter by category
    if (currentFilters.category !== 'all') {
        filtered = filtered.filter(tour => tour.category === currentFilters.category);
    }
    
    // Filter by price
    filtered = filtered.filter(tour => 
        tour.price >= currentFilters.minPrice && 
        tour.price <= currentFilters.maxPrice
    );
    
    // Sort
    filtered = sortTours(filtered, currentFilters.sortBy);
    
    // Render
    renderTours(filtered);
}

// Sort tours
function sortTours(tours, sortBy) {
    const sorted = [...tours];
    
    switch(sortBy) {
        case 'price-asc':
            return sorted.sort((a, b) => a.price - b.price);
        case 'price-desc':
            return sorted.sort((a, b) => b.price - a.price);
        case 'rating':
            return sorted.sort((a, b) => b.rating - a.rating);
        case 'featured':
        default:
            return sorted.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
}

// Render tours
function renderTours(tours) {
    const toursGrid = document.querySelector('.tours-grid');
    if (!toursGrid) return;
    
    if (tours.length === 0) {
        toursGrid.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">😔</div>
                <div class="no-results-text">Nessuna escursione trovata</div>
                <div class="no-results-hint">Prova a modificare i filtri</div>
            </div>
        `;
        return;
    }
    
    toursGrid.innerHTML = tours.map(tour => `
        <div class="tour-card" onclick="viewTourDetail(${tour.id})">
            <div class="tour-image">
                ${tour.badge ? `<div class="tour-badge">${tour.badge}</div>` : ''}
            </div>
            <div class="tour-content">
                <div class="tour-title">${tour.name}</div>
                <div class="tour-description">${tour.description}</div>
                <div class="tour-info">
                    <div class="info-item">
                        <span>⏱️</span>
                        <span>${tour.duration}</span>
                    </div>
                    <div class="info-item">
                        <span>👥</span>
                        <span>Max ${tour.maxPeople}</span>
                    </div>
                    <div class="info-item">
                        <span>🕐</span>
                        <span>${tour.departure}</span>
                    </div>
                </div>
                <div class="tour-footer">
                    <div class="tour-price">€${tour.price}</div>
                    <button class="tour-book-btn" onclick="viewTourDetail(${tour.id}); event.stopPropagation();">Prenota</button>
                </div>
            </div>
        </div>
    `).join('');
}

// View tour detail
function viewTourDetail(tourId) {
    // Navigate to detail page with tour ID
    window.location.href = `tour-detail.html?id=${tourId}`;
}

// Toggle price filter
function togglePriceFilter() {
    const dropdown = document.getElementById('priceDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

// Apply price filter
function applyPriceFilter() {
    const minPrice = parseInt(document.getElementById('minPrice').value);
    const maxPrice = parseInt(document.getElementById('maxPrice').value);
    
    currentFilters.minPrice = minPrice;
    currentFilters.maxPrice = maxPrice;
    
    filterAndRenderTours();
    togglePriceFilter();
}

// Handle sort change
function handleSortChange() {
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        currentFilters.sortBy = sortSelect.value;
        filterAndRenderTours();
    }
}

// Price slider value update
document.addEventListener('DOMContentLoaded', function() {
    const minPriceSlider = document.getElementById('minPrice');
    const maxPriceSlider = document.getElementById('maxPrice');
    
    if (minPriceSlider) {
        minPriceSlider.addEventListener('input', function() {
            document.getElementById('minPriceValue').textContent = this.value;
        });
    }
    
    if (maxPriceSlider) {
        maxPriceSlider.addEventListener('input', function() {
            document.getElementById('maxPriceValue').textContent = this.value;
        });
    }
});

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.initToursPage = initToursPage;
    window.viewTourDetail = viewTourDetail;
    window.togglePriceFilter = togglePriceFilter;
    window.applyPriceFilter = applyPriceFilter;
    window.handleSortChange = handleSortChange;
}
