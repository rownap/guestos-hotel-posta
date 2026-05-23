// PWA Install Prompt Component
// Add this script to show a friendly "Add to Home Screen" popup

(function() {
    const PWA_PROMPT_KEY = 'guestos_pwa_last_prompt';
    const DELAY_MS = 30000; // 30 seconds
    
    let deferredPrompt = null;

    // Check if should show prompt
    function shouldShowPrompt() {
        // Don't show if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return false;
        }

        // Check if shown today
        const lastPrompt = localStorage.getItem(PWA_PROMPT_KEY);
        const today = new Date().toDateString();
        
        if (lastPrompt === today) {
            return false;
        }

        return true;
    }

    // Create popup HTML
    function createPromptHTML() {
        const popup = document.createElement('div');
        popup.id = 'pwa-install-prompt';
        popup.innerHTML = `
            <style>
                #pwa-install-prompt {
                    position: fixed;
                    bottom: -300px;
                    left: 50%;
                    transform: translateX(-50%);
                    max-width: 400px;
                    width: calc(100% - 40px);
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 25px;
                    border-radius: 20px 20px 0 0;
                    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.3);
                    z-index: 10000;
                    transition: bottom 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
                }

                #pwa-install-prompt.show {
                    bottom: 0;
                }

                .pwa-header {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-bottom: 15px;
                }

                .pwa-icon {
                    font-size: 48px;
                    animation: float 2s ease-in-out infinite;
                }

                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }

                .pwa-text {
                    flex: 1;
                }

                .pwa-title {
                    font-size: 18px;
                    font-weight: 800;
                    margin-bottom: 5px;
                }

                .pwa-subtitle {
                    font-size: 13px;
                    opacity: 0.9;
                }

                .pwa-buttons {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }

                .pwa-btn {
                    flex: 1;
                    padding: 14px;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .pwa-btn-primary {
                    background: white;
                    color: #667eea;
                }

                .pwa-btn-primary:hover {
                    transform: scale(1.05);
                    box-shadow: 0 5px 15px rgba(255, 255, 255, 0.3);
                }

                .pwa-btn-secondary {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                }

                .pwa-btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                .pwa-close {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    opacity: 0.7;
                    transition: all 0.2s;
                }

                .pwa-close:hover {
                    opacity: 1;
                    background: rgba(255, 255, 255, 0.2);
                }
            </style>
            <button class="pwa-close" onclick="dismissPWAPrompt()">×</button>
            <div class="pwa-header">
                <div class="pwa-icon">📱</div>
                <div class="pwa-text">
                    <div class="pwa-title">Aggiungi alla Home!</div>
                    <div class="pwa-subtitle">Accedi più velocemente all'app</div>
                </div>
            </div>
            <div class="pwa-buttons">
                <button class="pwa-btn pwa-btn-primary" onclick="installPWA()">
                    Aggiungi Ora
                </button>
                <button class="pwa-btn pwa-btn-secondary" onclick="dismissPWAPrompt()">
                    Forse Dopo
                </button>
            </div>
        `;
        return popup;
    }

    // Show the prompt
    function showPrompt() {
        if (!shouldShowPrompt()) return;

        const popup = createPromptHTML();
        document.body.appendChild(popup);

        // Animate in
        setTimeout(() => {
            popup.classList.add('show');
        }, 100);

        // Mark as shown today
        localStorage.setItem(PWA_PROMPT_KEY, new Date().toDateString());
    }

    // Dismiss prompt
    window.dismissPWAPrompt = function() {
        const popup = document.getElementById('pwa-install-prompt');
        if (popup) {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 500);
        }
    };

    // Install PWA
    window.installPWA = async function() {
        if (deferredPrompt) {
            // Show native install prompt
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to install prompt: ${outcome}`);
            deferredPrompt = null;
        } else {
            // Show manual instructions for iOS
            showManualInstructions();
        }
        dismissPWAPrompt();
    };

    // Manual instructions for iOS
    function showManualInstructions() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            const instructions = document.createElement('div');
            instructions.id = 'pwa-instructions';
            instructions.innerHTML = `
                <style>
                    #pwa-instructions {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.9);
                        z-index: 10001;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                        animation: fadeIn 0.3s;
                    }
                    
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    .instructions-content {
                        background: white;
                        color: #333;
                        padding: 30px;
                        border-radius: 20px;
                        max-width: 400px;
                        text-align: center;
                    }

                    .instructions-content h3 {
                        font-size: 24px;
                        margin-bottom: 20px;
                    }

                    .instructions-content p {
                        font-size: 15px;
                        line-height: 1.6;
                        margin-bottom: 15px;
                    }

                    .share-icon {
                        font-size: 32px;
                        margin: 10px 0;
                    }

                    .close-instructions {
                        width: 100%;
                        padding: 15px;
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-size: 16px;
                        font-weight: 700;
                        margin-top: 20px;
                        cursor: pointer;
                    }
                </style>
                <div class="instructions-content">
                    <h3>Come installare su iOS</h3>
                    <p>1. Tocca il pulsante Condividi</p>
                    <div class="share-icon">⬆️</div>
                    <p>2. Scorri e seleziona<br>"Aggiungi alla schermata Home"</p>
                    <p>3. Tocca "Aggiungi"</p>
                    <button class="close-instructions" onclick="this.closest('#pwa-instructions').remove()">
                        Ho Capito!
                    </button>
                </div>
            `;
            document.body.appendChild(instructions);
        }
    }

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    // Show prompt after delay
    setTimeout(() => {
        showPrompt();
    }, DELAY_MS);
})();
