/**
 * GUESTOS - Theme Manager
 * Gestisce l'applicazione di temi e palette di colori
 */

const themes = {
    'neon-dreams': {
        name: 'Neon Dreams',
        variables: {
            '--primary-gradient': 'linear-gradient(135deg, #FF0080 0%, #FF3399 25%, #00D4FF 75%, #00E5FF 100%)',
            '--primary-color': '#FF0080',
            '--secondary-color': '#00D4FF',
            '--accent-color': '#FF3399',
            '--glass-bg': 'rgba(255, 255, 255, 0.15)',
            '--glass-border': 'rgba(255, 255, 255, 0.3)',
            '--text-shadow': '2px 2px 8px rgba(0, 0, 0, 0.25)',
            '--bubble-gradient': 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.6), rgba(0, 212, 255, 0.3))'
        }
    },
    'royal-gold': {
        name: 'Royal Gold',
        variables: {
            '--primary-gradient': 'linear-gradient(135deg, #1A237E 0%, #283593 25%, #C5A059 75%, #D4AF37 100%)',
            '--primary-color': '#1A237E',
            '--secondary-color': '#D4AF37',
            '--accent-color': '#C5A059',
            '--glass-bg': 'rgba(255, 255, 255, 0.1)',
            '--glass-border': 'rgba(212, 175, 55, 0.3)',
            '--text-shadow': '2px 2px 10px rgba(0, 0, 0, 0.5)',
            '--bubble-gradient': 'radial-gradient(circle at 30% 30%, rgba(212, 175, 55, 0.4), rgba(26, 35, 126, 0.2))'
        }
    },
    'forest-wellness': {
        name: 'Forest Wellness',
        variables: {
            '--primary-gradient': 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 25%, #52B788 50%, #95D5B2 75%, #D8F3DC 100%)',
            '--primary-color': '#2D6A4F',
            '--secondary-color': '#95D5B2',
            '--accent-color': '#52B788',
            '--glass-bg': 'rgba(255, 255, 255, 0.2)',
            '--glass-border': 'rgba(255, 255, 255, 0.4)',
            '--text-shadow': '1px 1px 5px rgba(0, 0, 0, 0.2)',
            '--bubble-gradient': 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.5), rgba(45, 106, 79, 0.2))'
        }
    },
    'summer-sunset': {
        name: 'Summer Sunset',
        variables: {
            '--primary-gradient': 'linear-gradient(135deg, #800000 0%, #D32F2F 25%, #FF8C00 50%, #F9D423 75%, #FFF9C4 100%)',
            '--primary-color': '#D32F2F',
            '--secondary-color': '#F9D423',
            '--accent-color': '#FF8C00',
            '--glass-bg': 'rgba(255, 255, 255, 0.2)',
            '--glass-border': 'rgba(255, 255, 255, 0.4)',
            '--text-shadow': '2px 2px 6px rgba(0, 0, 0, 0.2)',
            '--bubble-gradient': 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.6), rgba(211, 47, 47, 0.2))'
        }
    },
    'cyber-dark': {
        name: 'Cyber Dark',
        variables: {
            '--primary-gradient': 'linear-gradient(135deg, #0D0221 0%, #0F084B 25%, #261445 50%, #C850C0 75%, #FFCC70 100%)',
            '--primary-color': '#261445',
            '--secondary-color': '#00FF41',
            '--accent-color': '#C850C0',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)',
            '--glass-border': 'rgba(200, 80, 192, 0.3)',
            '--text-shadow': '0 0 10px rgba(0, 255, 65, 0.3)',
            '--bubble-gradient': 'radial-gradient(circle at 30% 30%, rgba(0, 255, 65, 0.1), rgba(13, 2, 33, 0.5))'
        }
    }
};

function applyTheme(themeName) {
    const theme = themes[themeName] || themes['neon-dreams'];
    const root = document.documentElement;

    Object.entries(theme.variables).forEach(([property, value]) => {
        root.style.setProperty(property, value);
    });

    localStorage.setItem('guestos_theme', themeName);

    // Update theme-color meta tag
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', theme.variables['--primary-color']);
    }
}

// Inizializzazione automatica
(function initTheme() {
    const savedTheme = localStorage.getItem('guestos_theme') || 'neon-dreams';

    // Applichiamo il tema immediatamente se il body esiste, oppure al DOMContentLoaded
    if (document.documentElement) {
        applyTheme(savedTheme);
    } else {
        document.addEventListener('DOMContentLoaded', () => applyTheme(savedTheme));
    }
})();

// Esponi la funzione globalmente
window.applyTheme = applyTheme;
window.guestosThemes = themes;
