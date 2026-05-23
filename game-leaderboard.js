// Game Leaderboard Modal Component
// Shows game-specific leaderboard in a beautiful modal

(function () {
    // Create modal HTML
    const modalHTML = `
        <div id="gameLeaderboardModal" class="game-leaderboard-modal">
            <div class="game-leaderboard-content">
                <div class="game-leaderboard-header">
                    <div class="game-leaderboard-title">
                        <span id="gameLeaderboardIcon">🎮</span>
                        <span id="gameLeaderboardName">Leaderboard</span>
                    </div>
                    <button class="game-leaderboard-close" onclick="closeGameLeaderboard()">×</button>
                </div>
                
                <div class="game-leaderboard-podium" id="gameLeaderboardPodium"></div>
                
                <div class="game-leaderboard-list" id="gameLeaderboardList">
                    <div class="loading" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">
                        Caricamento...
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inject CSS
    const styles = `
        <style>
            .game-leaderboard-modal {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(10, 10, 18, 0.6);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                z-index: 10000;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: fadeIn 0.4s ease;
            }

            .game-leaderboard-modal.show {
                display: flex;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .game-leaderboard-content {
                background: rgba(19, 19, 31, 0.85);
                backdrop-filter: blur(40px) saturate(180%);
                -webkit-backdrop-filter: blur(40px) saturate(180%);
                border-radius: 28px;
                max-width: 500px;
                width: 100%;
                max-height: 80vh;
                overflow: hidden;
                animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                border: 2px solid rgba(255, 255, 255, 0.15);
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
            }

            @keyframes slideUp {
                from { transform: translateY(50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            .game-leaderboard-header {
                padding: 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(255, 255, 255, 0.02);
            }

            .game-leaderboard-title {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 22px;
                font-weight: 800;
                color: white;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }

            #gameLeaderboardIcon {
                font-size: 32px;
                filter: drop-shadow(0 2px 8px rgba(99, 102, 241, 0.5));
            }

            .game-leaderboard-close {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: white;
                font-size: 28px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            }

            .game-leaderboard-close:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: scale(1.15) rotate(90deg);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
            }

            .game-leaderboard-close:active {
                transform: scale(0.95) rotate(90deg);
            }

            .game-leaderboard-podium {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 12px;
                padding: 20px;
                align-items: end;
            }

            .podium-item {
                text-align: center;
            }

            .podium-item.first { order: 2; }
            .podium-item.second { order: 1; }
            .podium-item.third { order: 3; }

            .podium-avatar {
                width: 56px;
                height: 56px;
                margin: 0 auto 8px;
                border-radius: 50%;
                background: linear-gradient(135deg, #6366f1, #a855f7);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                position: relative;
            }

            .podium-item.first .podium-avatar {
                width: 72px;
                height: 72px;
                font-size: 32px;
            }

            .podium-crown {
                position: absolute;
                top: -10px;
                font-size: 24px;
            }

            .podium-platform {
                background: rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 2px solid rgba(255, 255, 255, 0.12);
                border-radius: 16px 16px 0 0;
                padding: 12px 8px;
                box-shadow: 
                    0 8px 24px rgba(0, 0, 0, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
                transition: all 0.3s ease;
            }

            .podium-item.first .podium-platform {
                padding: 18px 8px;
                border-color: rgba(255, 215, 0, 0.5);
                background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.1));
                box-shadow: 
                    0 12px 32px rgba(255, 215, 0, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
            }

            .podium-rank {
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 4px;
            }

            .podium-item.first .podium-rank { color: #ffd700; }
            .podium-item.second .podium-rank { color: #c0c0c0; }
            .podium-item.third .podium-rank { color: #cd7f32; }

            .podium-name {
                font-size: 12px;
                font-weight: 600;
                margin-bottom: 4px;
                color: white;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .podium-score {
                font-size: 14px;
                font-weight: 700;
                color: #6366f1;
            }

            .game-leaderboard-list {
                padding: 20px;
                max-height: 400px;
                overflow-y: auto;
            }

            .game-ranking-item {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px;
                padding: 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 10px;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 
                    0 4px 12px rgba(0, 0, 0, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                position: relative;
                overflow: hidden;
            }

            .game-ranking-item::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
                transition: left 0.5s;
            }

            .game-ranking-item:hover::before {
                left: 100%;
            }

            .game-ranking-item:hover {
                background: rgba(99, 102, 241, 0.15);
                border-color: rgba(99, 102, 241, 0.4);
                transform: translateY(-2px) scale(1.02);
                box-shadow: 
                    0 8px 24px rgba(99, 102, 241, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
            }

            .game-ranking-item.me {
                border-color: rgba(99, 102, 241, 0.6);
                background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.15));
                box-shadow: 
                    0 8px 24px rgba(99, 102, 241, 0.25),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
            }

            .game-rank-number {
                font-size: 16px;
                font-weight: 700;
                color: rgba(255, 255, 255, 0.5);
                min-width: 28px;
            }

            .game-user-avatar {
                width: 36px;
                height: 36px;
                border-radius: 10px;
                background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
            }

            .game-user-info {
                flex: 1;
            }

            .game-user-name {
                font-weight: 600;
                color: white;
                font-size: 14px;
            }

            .game-user-score {
                font-size: 16px;
                font-weight: 700;
                color: #6366f1;
            }
        </style>
    `;

    // Inject into DOM on load
    document.addEventListener('DOMContentLoaded', () => {
        document.head.insertAdjacentHTML('beforeend', styles);
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    });

    // Public function to open leaderboard
    window.openGameLeaderboard = async function (gameId, gameName, gameIcon) {
        const modal = document.getElementById('gameLeaderboardModal');
        const nameEl = document.getElementById('gameLeaderboardName');
        const iconEl = document.getElementById('gameLeaderboardIcon');
        const podiumEl = document.getElementById('gameLeaderboardPodium');
        const listEl = document.getElementById('gameLeaderboardList');

        // Set title
        nameEl.textContent = gameName;
        iconEl.textContent = gameIcon;

        // Show modal
        modal.classList.add('show');

        // Load data
        try {
            listEl.innerHTML = '<div class="loading" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Caricamento...</div>';
            podiumEl.innerHTML = '';

            const { data, error } = await supabaseClient
                .from('game_scores')
                .select('score, user_name, username, user_email')
                .eq('game_id', gameId)
                .order('score', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (data && data.length > 0) {
                renderGameLeaderboard(data, podiumEl, listEl);
            } else {
                listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Nessun punteggio ancora!</div>';
            }
        } catch (error) {
            console.error('Error loading game leaderboard:', error);
            listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Errore caricamento</div>';
        }
    };

    // Close function
    window.closeGameLeaderboard = function () {
        const modal = document.getElementById('gameLeaderboardModal');
        modal.classList.remove('show');
    };

    // Render function
    function renderGameLeaderboard(scores, podiumEl, listEl) {
        // Render podium
        podiumEl.innerHTML = '';
        if (scores.length >= 1) {
            podiumEl.innerHTML += createPodiumItem(scores[0], 1, '🥇', 'first');
        }
        if (scores.length >= 2) {
            podiumEl.innerHTML += createPodiumItem(scores[1], 2, '🥈', 'second');
        }
        if (scores.length >= 3) {
            podiumEl.innerHTML += createPodiumItem(scores[2], 3, '🥉', 'third');
        }

        // Render list
        listEl.innerHTML = '';
        const currentUserEmail = localStorage.getItem('guestos_user_email') || '';

        scores.slice(3).forEach((score, index) => {
            const rank = index + 4;
            const isMe = score.user_email === currentUserEmail;

            listEl.innerHTML += `
                <div class="game-ranking-item ${isMe ? 'me' : ''}">
                    <div class="game-rank-number">#${rank}</div>
                    <div class="game-user-avatar">👤</div>
                    <div class="game-user-info">
                        <div class="game-user-name">${score.username || score.user_name || 'Ospite'}</div>
                    </div>
                    <div class="game-user-score">${score.score}</div>
                </div>
            `;
        });
    }

    function createPodiumItem(score, rank, medal, className) {
        return `
            <div class="podium-item ${className}">
                <div class="podium-avatar">
                    ${rank === 1 ? '<div class="podium-crown">👑</div>' : ''}
                    👤
                </div>
                <div class="podium-platform">
                    <div class="podium-rank">${medal} #${rank}</div>
                    <div class="podium-name">${score.username || score.user_name || 'Ospite'}</div>
                    <div class="podium-score">${score.score}</div>
                </div>
            </div>
        `;
    }

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeGameLeaderboard();
        }
    });

    // Close on background click
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('gameLeaderboardModal');
        if (e.target === modal) {
            closeGameLeaderboard();
        }
    });
})();

// Helper function to save game score
window.saveGameScore = async function (gameId, score) {
    const email = localStorage.getItem('guestos_user_email') || 'guest@hotel.com';
    const userName = localStorage.getItem('guestos_user_name') || 'Ospite';
    const username = localStorage.getItem('guestos_username');

    try {
        // Check if user has existing score
        const { data: existing } = await supabaseClient
            .from('game_scores')
            .select('score')
            .eq('user_email', email)
            .eq('game_id', gameId)
            .single();

        if (existing && existing.score >= score) {
            // Don't update if current score is not better
            return;
        }

        // Upsert score
        const { error } = await supabaseClient
            .from('game_scores')
            .upsert({
                user_email: email,
                user_name: userName,
                username: username,
                game_id: gameId,
                score: score,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_email,game_id'
            });

        if (error) throw error;
        console.log(`✅ Saved score ${score} for game ${gameId}`);
    } catch (error) {
        console.error('Error saving game score:', error);
    }
};
