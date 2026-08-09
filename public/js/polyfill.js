/* ═══════════════════════════════════════════════════════════════════
   BUBBLE WEB — Stash Polyfill
   Provides full implementations of `stash.*` APIs for the web version.
   Loaded BEFORE other JS modules so they don't crash when accessing stash.
   ═══════════════════════════════════════════════════════════════════ */

if (typeof stash === 'undefined') {
    // Helper to extract session data
    function getStoredArcodSession() {
        try {
            const raw = localStorage.getItem('creds_arcod_session');
            if (raw) return JSON.parse(raw);
            const rawToken = localStorage.getItem('creds_arcod_token');
            if (rawToken) {
                let token = rawToken.trim();
                if (token.startsWith('base64-')) {
                    try { token = atob(token.slice(7)); } catch (e) { }
                }
                if (token.startsWith('{')) {
                    const obj = JSON.parse(token);
                    return {
                        accessToken: obj.access_token || obj.accessToken || '',
                        refreshToken: obj.refresh_token || obj.refreshToken || '',
                        userEmail: obj.user?.email || 'Connected Account',
                        expiresAt: obj.expires_at ? obj.expires_at * 1000 : null
                    };
                }
                return { accessToken: token, userEmail: 'Connected Account' };
            }
        } catch (e) { }
        return null;
    }

    function saveArcodSession(session) {
        if (!session) return;
        localStorage.setItem('creds_arcod_session', JSON.stringify(session));
        if (session.accessToken) {
            localStorage.setItem('creds_arcod_token', session.accessToken);
        }
    }

    function removeArcodSession() {
        localStorage.removeItem('creds_arcod_session');
        localStorage.removeItem('creds_arcod_token');
        localStorage.removeItem('creds_arcod_stashkey');
    }

    // Interactive In-Web ARCOD Login Modal
    function showArcodLoginModal() {
        return new Promise((resolve) => {
            const existing = document.getElementById('arcod-login-modal-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'arcod-login-modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(8px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: arcodFadeIn 0.2s ease-out;
            `;

            overlay.innerHTML = `
                <div id="arcod-modal-card" style="
                    width: 100%;
                    max-width: 440px;
                    background: #14141e;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 16px;
                    padding: 28px;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(34, 197, 94, 0.15);
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #22c55e, #16a34a); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: #000; box-shadow: 0 0 16px rgba(34, 197, 94, 0.4);">
                                A
                            </div>
                            <div>
                                <div style="font-weight: 700; font-size: 17px; letter-spacing: -0.3px;">Connect ARCOD</div>
                                <div style="font-size: 12px; color: #8e8ea0;">Hi-Res 24-Bit FLAC Audio Engine</div>
                            </div>
                        </div>
                        <button id="arcod-modal-close" style="background: none; border: none; color: #8e8ea0; cursor: pointer; padding: 6px; border-radius: 6px; font-size: 18px; line-height: 1;">✕</button>
                    </div>

                    <!-- Google Sign In -->
                    <button type="button" id="arcod-google-btn" style="
                        width: 100%;
                        padding: 11px;
                        background: #ffffff;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 8px;
                        color: #1a1a1a;
                        font-weight: 600;
                        font-size: 14px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        margin-bottom: 16px;
                        transition: background 0.2s, transform 0.1s;
                    ">
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        <span>Continue with Google</span>
                    </button>

                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.1);"></div>
                        <div style="font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">or with email</div>
                        <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.1);"></div>
                    </div>

                    <!-- Auth Mode Tabs -->
                    <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 3px; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.05);">
                        <button id="arcod-tab-login" style="flex: 1; padding: 8px; border-radius: 6px; border: none; background: rgba(255, 255, 255, 0.12); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Sign In</button>
                        <button id="arcod-tab-signup" style="flex: 1; padding: 8px; border-radius: 6px; border: none; background: transparent; color: #8e8ea0; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Create Account</button>
                    </div>

                    <div id="arcod-modal-error" style="display: none; padding: 10px 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 12px; margin-bottom: 16px; line-height: 1.4;"></div>

                    <form id="arcod-auth-form" style="display: flex; flex-direction: column; gap: 14px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 500; color: #a1a1aa; margin-bottom: 6px;">Email address</label>
                            <input type="email" id="arcod-input-email" required placeholder="your.email@example.com" style="width: 100%; box-sizing: border-box; padding: 10px 12px; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s;">
                        </div>

                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 500; color: #a1a1aa; margin-bottom: 6px;">Password</label>
                            <input type="password" id="arcod-input-password" required placeholder="••••••••" style="width: 100%; box-sizing: border-box; padding: 10px 12px; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s;">
                        </div>

                        <button type="submit" id="arcod-submit-btn" style="width: 100%; padding: 12px; margin-top: 6px; background: #22c55e; border: none; border-radius: 8px; color: #000; font-weight: 700; font-size: 14px; cursor: pointer; transition: background 0.2s, transform 0.1s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <span>Sign In & Connect</span>
                        </button>
                    </form>

                    <div style="margin-top: 18px; text-align: center; font-size: 11px; color: #71717a; line-height: 1.5;">
                        Connects directly to ARCOD's authentication service. Your credentials are used securely to generate lossless stream sessions.
                    </div>
                </div>
                <style>
                    @keyframes arcodFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                    #arcod-input-email:focus, #arcod-input-password:focus { border-color: #22c55e !important; box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); }
                    #arcod-google-btn:hover { background: #f4f4f5 !important; }
                    #arcod-google-btn:active { transform: scale(0.99); }
                    #arcod-submit-btn:hover { background: #16a34a !important; }
                    #arcod-submit-btn:active { transform: scale(0.99); }
                </style>
            `;

            document.body.appendChild(overlay);

            let currentAction = 'login';
            const googleBtn = document.getElementById('arcod-google-btn');
            const tabLogin = document.getElementById('arcod-tab-login');
            const tabSignup = document.getElementById('arcod-tab-signup');
            const submitBtn = document.getElementById('arcod-submit-btn');
            const errorBox = document.getElementById('arcod-modal-error');
            const emailInput = document.getElementById('arcod-input-email');
            const passwordInput = document.getElementById('arcod-input-password');
            const closeBtn = document.getElementById('arcod-modal-close');
            const form = document.getElementById('arcod-auth-form');

            function closeModal(result) {
                overlay.remove();
                resolve(result || { success: false, error: 'Cancelled' });
            }

            closeBtn.onclick = () => closeModal();
            overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

            // Google OAuth Sign In Handler
            googleBtn.onclick = () => {
                const width = 500, height = 650;
                const left = window.screenX + (window.outerWidth - width) / 2;
                const top = window.screenY + (window.outerHeight - height) / 2;
                const callbackUrl = encodeURIComponent(window.location.origin + '/auth/arcod/callback');
                const authUrl = `https://fnlghyzwyoklfqyhqlav.supabase.co/auth/v1/authorize?provider=google&redirect_to=${callbackUrl}`;

                const popup = window.open(
                    authUrl,
                    'arcod_google_auth',
                    `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
                );

                if (!popup) {
                    window.location.href = authUrl;
                    return;
                }

                googleBtn.disabled = true;
                googleBtn.style.opacity = '0.7';
                const span = googleBtn.querySelector('span');
                if (span) span.textContent = 'Waiting for Google sign-in...';

                function onMessage(event) {
                    if (event.data && event.data.type === 'ARCOD_AUTH_SUCCESS' && event.data.session) {
                        cleanup();
                        saveArcodSession(event.data.session);
                        closeModal({ success: true, session: event.data.session });
                    }
                }

                function onStorage(event) {
                    if (event.key === 'creds_arcod_session' || event.key === 'creds_arcod_token') {
                        const sess = getStoredArcodSession();
                        if (sess && sess.accessToken) {
                            cleanup();
                            closeModal({ success: true, session: sess });
                        }
                    }
                }

                function cleanup() {
                    window.removeEventListener('message', onMessage);
                    window.removeEventListener('storage', onStorage);
                    if (checkInterval) clearInterval(checkInterval);
                    googleBtn.disabled = false;
                    googleBtn.style.opacity = '1';
                    if (span) span.textContent = 'Continue with Google';
                }

                window.addEventListener('message', onMessage);
                window.addEventListener('storage', onStorage);

                const checkInterval = setInterval(() => {
                    const sess = getStoredArcodSession();
                    if (sess && sess.accessToken) {
                        cleanup();
                        closeModal({ success: true, session: sess });
                        return;
                    }
                    if (popup.closed) {
                        cleanup();
                    }
                }, 600);
            };

            tabLogin.onclick = () => {
                currentAction = 'login';
                tabLogin.style.background = 'rgba(255, 255, 255, 0.12)';
                tabLogin.style.color = '#fff';
                tabSignup.style.background = 'transparent';
                tabSignup.style.color = '#8e8ea0';
                submitBtn.innerHTML = '<span>Sign In & Connect</span>';
                errorBox.style.display = 'none';
            };

            tabSignup.onclick = () => {
                currentAction = 'signup';
                tabSignup.style.background = 'rgba(255, 255, 255, 0.12)';
                tabSignup.style.color = '#fff';
                tabLogin.style.background = 'transparent';
                tabLogin.style.color = '#8e8ea0';
                submitBtn.innerHTML = '<span>Create ARCOD Account</span>';
                errorBox.style.display = 'none';
            };

            form.onsubmit = async (e) => {
                e.preventDefault();
                errorBox.style.display = 'none';
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.7';
                submitBtn.innerHTML = '<span>Connecting...</span>';

                try {
                    const res = await fetch('/api/arcod/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: currentAction,
                            email: emailInput.value,
                            password: passwordInput.value,
                        }),
                    });

                    const data = await res.json();
                    if (!res.ok || !data.success) {
                        throw new Error(data.error || 'Authentication failed');
                    }

                    if (data.session) {
                        saveArcodSession(data.session);
                        closeModal({ success: true, session: data.session });
                    } else if (currentAction === 'signup') {
                        // Switch to login tab
                        tabLogin.click();
                        errorBox.style.display = 'block';
                        errorBox.style.background = 'rgba(34, 197, 94, 0.15)';
                        errorBox.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                        errorBox.style.color = '#4ade80';
                        errorBox.textContent = data.message || 'Account created! Please sign in.';
                        submitBtn.disabled = false;
                        submitBtn.style.opacity = '1';
                        submitBtn.innerHTML = '<span>Sign In & Connect</span>';
                    }
                } catch (err) {
                    errorBox.style.display = 'block';
                    errorBox.style.background = 'rgba(239, 68, 68, 0.15)';
                    errorBox.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    errorBox.style.color = '#f87171';
                    errorBox.textContent = err.message || 'Login failed. Please check your credentials.';
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                    submitBtn.innerHTML = currentAction === 'login' ? '<span>Sign In & Connect</span>' : '<span>Create ARCOD Account</span>';
                }
            };
        });
    }

    function showSpotifyLoginModal() {
        return new Promise((resolve) => {
            const existing = document.getElementById('spotify-web-auth-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'spotify-web-auth-modal';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
            `;

            overlay.innerHTML = `
                <div style="
                    background: #121212;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 20px;
                    width: 100%;
                    max-width: 460px;
                    padding: 32px 28px;
                    position: relative;
                    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.8);
                    font-family: inherit;
                    color: #fff;
                    animation: spotifyFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                ">
                    <button id="spotify-modal-close" style="
                        position: absolute;
                        top: 18px;
                        right: 18px;
                        background: rgba(255, 255, 255, 0.06);
                        border: none;
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        color: #a1a1aa;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        transition: all 0.2s;
                    ">&times;</button>

                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="
                            width: 64px;
                            height: 64px;
                            border-radius: 50%;
                            background: rgba(29, 185, 84, 0.15);
                            border: 1px solid rgba(29, 185, 84, 0.3);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #1ed760;
                            margin: 0 auto 16px auto;
                            box-shadow: 0 0 30px rgba(29, 185, 84, 0.2);
                        ">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.217.355-.678.47-1.033.253-2.83-1.73-6.393-2.12-10.59-1.162-.405.093-.81-.16-.902-.566-.093-.406.16-.81.566-.903 4.59-1.047 8.528-.606 11.705 1.344.356.217.47.678.254 1.034zm1.467-3.26c-.274.444-.86.588-1.304.314-3.24-1.99-8.18-2.567-12.012-1.403-.497.15-1.025-.133-1.176-.63-.152-.497.133-1.025.63-1.177 4.382-1.33 9.824-.688 13.548 1.592.444.274.588.86.314 1.304zm.126-3.41c-3.885-2.307-10.29-2.52-14.004-1.393-.596.18-1.226-.157-1.407-.753-.18-.596.157-1.227.753-1.407 4.268-1.296 11.332-1.045 15.82 1.62.536.318.71 1.01.392 1.546-.318.536-1.01.71-1.554.387z"/></svg>
                        </div>
                        <h2 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.3px;">Connect Spotify</h2>
                        <p style="margin: 0; font-size: 13px; color: #a1a1aa; line-height: 1.5;">Sign in to seamlessly sync your Spotify Liked Songs, playlists, and mixes in Lossless quality.</p>
                    </div>

                    <div id="spotify-modal-status" style="display: none; padding: 12px 16px; border-radius: 10px; margin-bottom: 18px; font-size: 13px; text-align: center; line-height: 1.4;"></div>

                    <!-- Main OAuth Action Button -->
                    <button type="button" id="spotify-oauth-btn" style="
                        width: 100%;
                        padding: 14px 20px;
                        background: #1ed760;
                        border: none;
                        border-radius: 12px;
                        color: #000;
                        font-weight: 700;
                        font-size: 15px;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        box-shadow: 0 4px 20px rgba(29, 185, 84, 0.3);
                    ">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.217.355-.678.47-1.033.253-2.83-1.73-6.393-2.12-10.59-1.162-.405.093-.81-.16-.902-.566-.093-.406.16-.81.566-.903 4.59-1.047 8.528-.606 11.705 1.344.356.217.47.678.254 1.034zm1.467-3.26c-.274.444-.86.588-1.304.314-3.24-1.99-8.18-2.567-12.012-1.403-.497.15-1.025-.133-1.176-.63-.152-.497.133-1.025.63-1.177 4.382-1.33 9.824-.688 13.548 1.592.444.274.588.86.314 1.304zm.126-3.41c-3.885-2.307-10.29-2.52-14.004-1.393-.596.18-1.226-.157-1.407-.753-.18-.596.157-1.227.753-1.407 4.268-1.296 11.332-1.045 15.82 1.62.536.318.71 1.01.392 1.546-.318.536-1.01.71-1.554.387z"/></svg>
                        <span>Sign In with Spotify</span>
                    </button>

                    <!-- Custom Spotify App Settings Trigger -->
                    <div style="margin-top: 14px; text-align: center;">
                        <button type="button" id="spotify-app-creds-toggle-btn" style="
                            background: none;
                            border: none;
                            color: #a1a1aa;
                            font-size: 12px;
                            cursor: pointer;
                            text-decoration: underline;
                            padding: 4px;
                            transition: color 0.2s;
                        ">Custom Spotify App (Client ID / Secret)</button>
                    </div>

                    <!-- Collapsible Custom App Section -->
                    <div id="spotify-custom-app-section" style="display: none; margin-top: 14px; padding: 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;">
                        <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 10px; line-height: 1.5;">
                            Create a free app at <a href="https://developer.spotify.com/dashboard" target="_blank" style="color: #1ed760; text-decoration: underline;">developer.spotify.com/dashboard</a> and add these <strong>Redirect URIs</strong> under Settings:<br>
                            <code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px; color: #fff; font-size: 11px; display: inline-block; margin-top: 4px;">http://localhost:3000/auth/spotify/callback</code><br>
                            <code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px; color: #fff; font-size: 11px; display: inline-block; margin-top: 2px;">http://127.0.0.1:3000/auth/spotify/callback</code>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <input type="text" id="spotify-input-client-id" placeholder="Client ID" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #fff; font-size: 12px; font-family: monospace; outline: none;">
                            <input type="password" id="spotify-input-client-secret" placeholder="Client Secret" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #fff; font-size: 12px; font-family: monospace; outline: none;">
                            <button type="button" id="spotify-save-app-creds-btn" style="padding: 8px; background: rgba(30, 215, 96, 0.2); border: 1px solid rgba(30, 215, 96, 0.4); border-radius: 8px; color: #1ed760; font-weight: 600; font-size: 12px; cursor: pointer;">
                                Save App Credentials
                            </button>
                        </div>
                    </div>

                    <!-- Cookie Fallback Trigger -->
                    <div style="margin-top: 10px; text-align: center;">
                        <button type="button" id="spotify-cookie-toggle-btn" style="
                            background: none;
                            border: none;
                            color: #71717a;
                            font-size: 11px;
                            cursor: pointer;
                            text-decoration: underline;
                            padding: 4px;
                            transition: color 0.2s;
                        ">Advanced: Session cookie (sp_dc)</button>
                    </div>

                    <!-- Collapsible Cookie Panel -->
                    <div id="spotify-manual-cookie-section" style="display: none; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <form id="spotify-auth-form" style="display: flex; flex-direction: column; gap: 12px;">
                            <div>
                                <label style="display: block; font-size: 11px; font-weight: 500; color: #a1a1aa; margin-bottom: 6px;">Spotify Session Cookie (sp_dc)</label>
                                <textarea id="spotify-input-cookie" placeholder="AQB..." rows="2" style="width: 100%; box-sizing: border-box; padding: 10px 12px; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #fff; font-size: 12px; font-family: monospace; outline: none; transition: border-color 0.2s; resize: vertical;"></textarea>
                            </div>
                            <button type="submit" id="spotify-cookie-submit-btn" style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #fff; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s;">
                                Save & Connect Cookie
                            </button>
                        </form>
                    </div>
                </div>
                <style>
                    @keyframes spotifyFadeIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                    #spotify-oauth-btn:hover { background: #1fdf64 !important; transform: translateY(-2px); box-shadow: 0 6px 24px rgba(29, 185, 84, 0.4); }
                </style>
            `;

            document.body.appendChild(overlay);

            const closeBtn = document.getElementById('spotify-modal-close');
            const oauthBtn = document.getElementById('spotify-oauth-btn');
            const cookieToggleBtn = document.getElementById('spotify-cookie-toggle-btn');
            const cookieSection = document.getElementById('spotify-manual-cookie-section');
            const appCredsToggleBtn = document.getElementById('spotify-app-creds-toggle-btn');
            const appCredsSection = document.getElementById('spotify-custom-app-section');
            const clientIdInput = document.getElementById('spotify-input-client-id');
            const clientSecretInput = document.getElementById('spotify-input-client-secret');
            const saveAppCredsBtn = document.getElementById('spotify-save-app-creds-btn');
            const form = document.getElementById('spotify-auth-form');
            const cookieInput = document.getElementById('spotify-input-cookie');
            const statusBox = document.getElementById('spotify-modal-status');

            if (clientIdInput) clientIdInput.value = localStorage.getItem('creds_spotify_client_id') || '';
            if (clientSecretInput) clientSecretInput.value = localStorage.getItem('creds_spotify_client_secret') || '';

            const showStatus = (msg, isErr = false, isSuccess = false) => {
                statusBox.style.display = 'block';
                if (isErr) {
                    statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
                    statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                    statusBox.style.color = '#f87171';
                } else if (isSuccess) {
                    statusBox.style.background = 'rgba(34, 197, 94, 0.15)';
                    statusBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
                    statusBox.style.color = '#4ade80';
                } else {
                    statusBox.style.background = 'rgba(59, 130, 246, 0.15)';
                    statusBox.style.border = '1px solid rgba(59, 130, 246, 0.3)';
                    statusBox.style.color = '#60a5fa';
                }
                statusBox.innerHTML = msg;
            };

            let pollTimer = null;
            const closeModal = (res = { success: false }) => {
                if (pollTimer) clearInterval(pollTimer);
                window.removeEventListener('message', onMessage);
                overlay.remove();
                resolve(res);
            };

            closeBtn.onclick = () => closeModal();
            overlay.onclick = (e) => {
                if (e.target === overlay) closeModal();
            };

            if (appCredsToggleBtn) {
                appCredsToggleBtn.onclick = () => {
                    appCredsSection.style.display = appCredsSection.style.display === 'none' ? 'block' : 'none';
                };
            }

            if (saveAppCredsBtn) {
                saveAppCredsBtn.onclick = () => {
                    const cid = (clientIdInput.value || '').trim();
                    const sec = (clientSecretInput.value || '').trim();
                    if (cid) localStorage.setItem('creds_spotify_client_id', cid);
                    else localStorage.removeItem('creds_spotify_client_id');
                    if (sec) localStorage.setItem('creds_spotify_client_secret', sec);
                    else localStorage.removeItem('creds_spotify_client_secret');
                    showStatus('App credentials saved! Click "Sign In with Spotify".', false, true);
                    appCredsSection.style.display = 'none';
                };
            }

            if (cookieToggleBtn) {
                cookieToggleBtn.onclick = () => {
                    cookieSection.style.display = cookieSection.style.display === 'none' ? 'block' : 'none';
                };
            }

            const onMessage = (event) => {
                if (event.data && event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
                    const data = event.data;
                    const token = data.accessToken || data.token;
                    if (token) {
                        localStorage.setItem('creds_spotify_token', token);
                        if (data.refreshToken) localStorage.setItem('creds_spotify_refresh_token', data.refreshToken);
                        const expMs = data.expiresAt || (data.expiresIn ? Date.now() + data.expiresIn * 1000 : Date.now() + 3600000);
                        localStorage.setItem('creds_spotify_token_expiry', String(expMs));
                        if (window.BubbleSpotify) {
                            window.BubbleSpotify.connected = true;
                        }
                        showStatus(`Connected as <strong>${(data.profile && data.profile.display_name) || 'Spotify User'}</strong>!`, false, true);
                        setTimeout(() => {
                            closeModal({ success: true, profile: data.profile });
                        }, 800);
                    }
                }
            };
            window.addEventListener('message', onMessage);

            // OAuth Button click
            oauthBtn.onclick = async () => {
                showStatus('Opening Spotify authorization window...', false, false);
                oauthBtn.disabled = true;
                oauthBtn.style.opacity = '0.7';

                const storedClientId = localStorage.getItem('creds_spotify_client_id') || '';
                const storedClientSecret = localStorage.getItem('creds_spotify_client_secret') || '';

                let authUrl = '';
                try {
                    const headers = {};
                    if (storedClientId) headers['x-spotify-client-id'] = storedClientId;
                    if (storedClientSecret) headers['x-spotify-client-secret'] = storedClientSecret;

                    const res = await fetch('/api/spotify/auth?action=url', { headers });
                    const data = await res.json();
                    if (data.url) authUrl = data.url;
                } catch (e) { }

                if (!authUrl) {
                    const clientId = storedClientId || '5f573c9620494bae87890c0f08a60293';
                    const redirectUri = `${window.location.origin}/auth/spotify/callback`;
                    const scopes = [
                        'user-read-private',
                        'user-read-email',
                        'playlist-read-private',
                        'playlist-read-collaborative',
                        'user-library-read',
                        'user-library-modify',
                        'user-top-read',
                        'user-read-recently-played'
                    ].join(' ');
                    authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&show_dialog=true`;
                }

                const width = 520;
                const height = 720;
                const left = window.screenX + (window.outerWidth - width) / 2;
                const top = window.screenY + (window.outerHeight - height) / 2;
                const popup = window.open(authUrl, 'SpotifyAuthWindow', `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,menubar=0,location=1`);

                showStatus('Waiting for authorization to complete in the popup...', false, false);

                pollTimer = setInterval(async () => {
                    if (popup && popup.closed) {
                        clearInterval(pollTimer);
                        const token = localStorage.getItem('creds_spotify_token');
                        if (token) {
                            if (window.BubbleSpotify) window.BubbleSpotify.connected = true;
                            showStatus('Connected successfully!', false, true);
                            setTimeout(() => closeModal({ success: true }), 600);
                        } else {
                            oauthBtn.disabled = false;
                            oauthBtn.style.opacity = '1';
                            showStatus('If Spotify showed "redirect_uri mismatch", click <strong>Custom Spotify App</strong> above to input your App Client ID with redirect URI: <br><code>http://localhost:3000/auth/spotify/callback</code>', true, false);
                        }
                    }
                }, 1000);
            };

            // Manual cookie form submit
            form.onsubmit = async (e) => {
                e.preventDefault();
                const cookieVal = (cookieInput.value || '').trim();
                if (!cookieVal) {
                    showStatus('Please enter your sp_dc cookie value.', true, false);
                    return;
                }

                showStatus('Verifying session cookie...', false, false);
                const submitBtn = document.getElementById('spotify-cookie-submit-btn');
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.7';

                try {
                    const res = await fetch('/api/spotify/profile', {
                        headers: { 'x-spotify-cookie': cookieVal }
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error || 'Failed to authenticate with Spotify session cookie.');
                    }

                    const profile = await res.json();
                    if (!profile || !profile.id) {
                        throw new Error('Spotify profile could not be verified.');
                    }

                    localStorage.setItem('creds_spotify_cookie', cookieVal);
                    if (window.BubbleSpotify) {
                        window.BubbleSpotify.connected = true;
                    }
                    showStatus(`Connected as <strong>${profile.display_name || profile.id}</strong>!`, false, true);
                    setTimeout(() => closeModal({ success: true, profile }), 800);
                } catch (err) {
                    showStatus(err.message || 'Verification failed. Please check the sp_dc value.', true, false);
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                }
            };
        });
    }

    window.stash = {
        _isPolyfill: true,

        /* ── Window controls (no-op on web) ──────────────────────────── */
        window: {
            minimize: () => { },
            maximize: () => { },
            close: () => { },
            onMaximized: () => { },
        },

        /* ── Tray (no-op on web) ────────────────────────────────────── */
        tray: {
            onPlayPause: () => { },
            onNext: () => { },
            onPrevious: () => { },
        },

        /* ── Database (web uses BubbleAPI) ───────────────────────────── */
        db: {
            getAll: async (sql) => {
                console.warn('[stash-polyfill] db.getAll called on web (no-op):', sql?.substring(0, 60));
                return [];
            },
            get: async (sql) => {
                console.warn('[stash-polyfill] db.get called on web (no-op):', sql?.substring(0, 60));
                return null;
            },
            run: async (sql) => {
                console.warn('[stash-polyfill] db.run called on web (no-op):', sql?.substring(0, 60));
                return { changes: 0, lastInsertRowid: 0 };
            },
        },

        /* ── Settings (web stores in localStorage) ───────────────────── */
        settings: {
            get: async (key) => localStorage.getItem('bubble_' + key) || null,
            set: async (key, value) => {
                localStorage.setItem('bubble_' + key, String(value));
                return true;
            },
            getAll: async () => {
                const result = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('bubble_')) {
                        result[k.replace('bubble_', '')] = localStorage.getItem(k);
                    }
                }
                return result;
            },
        },

        /* ── Credentials (web uses localStorage) ─────────────────────── */
        credentials: {
            save: async (creds) => {
                Object.entries(creds).forEach(([k, v]) => localStorage.setItem('creds_' + k, String(v)));
                return true;
            },
            load: async () => {
                const result = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('creds_')) {
                        result[k.replace('creds_', '')] = localStorage.getItem(k);
                    }
                }
                return result;
            },
            remove: async (key) => { localStorage.removeItem('creds_' + key); return true; },
        },

        /* ── Spotify ─────────────────────────────────────────────────── */
        spotify: {
            _getHeaders: async () => {
                let token = localStorage.getItem('creds_spotify_token') || '';
                const refreshToken = localStorage.getItem('creds_spotify_refresh_token') || '';
                const expiry = parseInt(localStorage.getItem('creds_spotify_token_expiry') || '0', 10);
                const cookie = localStorage.getItem('creds_spotify_cookie') || '';

                // Token refresh check (5 min buffer)
                if (refreshToken && expiry && Date.now() > expiry - 300000) {
                    try {
                        const refreshRes = await fetch('/api/spotify/auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'refresh', refresh_token: refreshToken })
                        });
                        const refreshData = await refreshRes.json();
                        if (refreshData.access_token) {
                            token = refreshData.access_token;
                            localStorage.setItem('creds_spotify_token', token);
                            if (refreshData.expires_in) {
                                localStorage.setItem('creds_spotify_token_expiry', String(Date.now() + refreshData.expires_in * 1000));
                            }
                        }
                    } catch (e) {
                        console.warn('[Spotify] Failed to refresh token:', e);
                    }
                }

                const headers = {};
                if (token) headers['x-spotify-token'] = token;
                if (cookie) headers['x-spotify-cookie'] = cookie;
                return headers;
            },

            disconnect: async () => {
                localStorage.removeItem('creds_spotify_token');
                localStorage.removeItem('creds_spotify_refresh_token');
                localStorage.removeItem('creds_spotify_token_expiry');
                localStorage.removeItem('creds_spotify_cookie');
                if (window.BubbleSpotify) window.BubbleSpotify.connected = false;
                return true;
            },

            request: async (endpoint) => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) {
                    throw new Error('Spotify not connected. Go to Settings to connect.');
                }
                const res = await fetch(`/api/spotify/proxy?path=${encodeURIComponent(endpoint)}`, { headers });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Spotify API error');
                }
                return res.json();
            },

            login: async () => {
                return showSpotifyLoginModal();
            },

            getProfile: async () => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return null;
                const res = await fetch('/api/spotify/profile', { headers });
                if (!res.ok) return null;
                return res.json();
            },

            getPlaylists: async (limit, offset) => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return [];
                const res = await fetch(`/api/spotify/playlists?limit=${limit || 50}&offset=${offset || 0}`, { headers });
                if (!res.ok) return [];
                return res.json();
            },

            getPlaylistTracks: async (playlistId) => {
                const headers = await stash.spotify._getHeaders();
                const res = await fetch(`/api/spotify/playlist-tracks?id=${encodeURIComponent(playlistId)}`, { headers });
                if (!res.ok) return [];
                return res.json();
            },

            getLikedSongs: async (limit, offset) => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return [];
                const res = await fetch(`/api/spotify/liked?limit=${limit || 50}&offset=${offset || 0}`, { headers });
                if (!res.ok) return [];
                return res.json();
            },

            getMixes: async () => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return [];
                const res = await fetch('/api/spotify/mixes', { headers });
                if (!res.ok) return [];
                return res.json();
            },

            setLibrary: async (uris, add) => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return false;
                const res = await fetch('/api/spotify/library', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uris, add: !!add })
                });
                if (!res.ok) return false;
                const data = await res.json();
                return !!data.success;
            },

            searchCatalog: async (query, types, limit) => {
                const headers = await stash.spotify._getHeaders();
                const typeParam = Array.isArray(types) ? types.join(',') : (types || 'album,artist,playlist,track');
                const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&types=${encodeURIComponent(typeParam)}&limit=${limit || 20}`, { headers });
                if (!res.ok) return { albums: [], artists: [], playlists: [], tracks: [] };
                return res.json();
            },

            saveAlbum: async (albumId) => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return { error: 'not_connected' };
                const res = await fetch('/api/spotify/albums', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'save_album', id: albumId })
                });
                return res.json();
            },

            followPlaylist: async (playlistId) => {
                const headers = await stash.spotify._getHeaders();
                if (!headers['x-spotify-token'] && !headers['x-spotify-cookie']) return { error: 'not_connected' };
                const res = await fetch('/api/spotify/albums', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'follow_playlist', id: playlistId })
                });
                return res.json();
            },

            getAlbumTracks: async (albumId) => {
                const headers = await stash.spotify._getHeaders();
                const res = await fetch(`/api/spotify/albums?id=${encodeURIComponent(albumId)}`, { headers });
                if (!res.ok) return [];
                return res.json();
            },
        },

        /* ── YouTube ─────────────────────────────────────────────────── */
        youtube: {
            _getCookie: () => localStorage.getItem('creds_youtube_cookie') || '',

            request: async (endpoint, body) => {
                const cookie = localStorage.getItem('creds_youtube_cookie') || '';
                if (!cookie) throw new Error('YouTube cookie not set. Go to Settings to connect.');
                const res = await fetch(`/api/youtube/proxy?path=${encodeURIComponent(endpoint)}`, {
                    method: body ? 'POST' : 'GET',
                    headers: { 'x-youtube-cookie': cookie, 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : undefined,
                });
                if (!res.ok) throw new Error('YouTube API error');
                return res.json();
            },
            login: async () => {
                const cookie = prompt('Paste your YouTube Music cookie:\n\n1. Go to music.youtube.com and log in\n2. Open DevTools (F12) → Application → Cookies\n3. Copy the cookie header value\n4. Paste it here:');
                if (cookie && cookie.trim()) {
                    localStorage.setItem('creds_youtube_cookie', cookie.trim());
                    return { success: true };
                }
                throw new Error('Cookie required');
            },
        },

        /* ── Music / Search / Streaming (proxied through Next.js API) ─ */
        music: {
            search: async (query) => {
                try {
                    const session = getStoredArcodSession();
                    const headers = {};
                    if (session?.accessToken) headers['x-arcod-token'] = session.accessToken;
                    const res = await fetch(`/api/arcod/search?q=${encodeURIComponent(query)}`, { headers });
                    if (res.ok) {
                        const data = await res.json();
                        return data.tracks || [];
                    }
                } catch (e) { }
                return [];
            },
            getStreamUrl: async (track) => {
                try {
                    let session = getStoredArcodSession();
                    if (session && session.refreshToken && session.expiresAt && Date.now() > session.expiresAt - 300000) {
                        try {
                            const refreshRes = await fetch('https://fnlghyzwyoklfqyhqlav.supabase.co/auth/v1/token?grant_type=refresh_token', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0',
                                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0'
                                },
                                body: JSON.stringify({ refresh_token: session.refreshToken })
                            });
                            const data = await refreshRes.json();
                            if (data.access_token) {
                                session.accessToken = data.access_token;
                                session.refreshToken = data.refresh_token || session.refreshToken;
                                session.expiresAt = Date.now() + (data.expires_in * 1000);
                                saveArcodSession(session);
                            }
                        } catch(e) { console.warn('[Web Music] ARCOD token refresh failed:', e); }
                    }
                    const stashKey = localStorage.getItem('creds_arcod_stashkey') || '';
                    const disableLossless = (await BubbleSettings.get('disable_lossless')) === 'true' || (await BubbleSettings.get('prefer_source')) === 'youtube';
                    const headers = {
                        'Content-Type': 'application/json',
                        'x-disable-lossless': disableLossless ? 'true' : 'false'
                    };

                    if (session?.accessToken) {
                        headers['x-arcod-token'] = session.accessToken;
                    }
                    if (stashKey) {
                        headers['x-arcod-stash-key'] = stashKey;
                    }

                    const res = await fetch('/api/stream/resolve', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ track, disableLossless }),
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const allowYT = (await BubbleSettings.get('allow_youtube_stream')) !== 'false';
                        if (!allowYT && data.source === 'youtube' && !disableLossless) {
                            return { error: 'youtube_disabled' };
                        }
                        if (data.url) return data;
                    }
                } catch (e) {
                    console.error('[Web Music] getStreamUrl error:', e);
                }
                throw new Error('No playable stream found');
            },
        },

        /* ── Downloads (Browser direct streaming to Desktop/Downloads) ─ */
        download: {
            _listeners: [],
            onProgress(cb) {
                if (typeof cb === 'function') this._listeners.push(cb);
            },
            _emit(data) {
                this._listeners.forEach(cb => { try { cb(data); } catch (e) { } });
            },
            async track(track) {
                if (!track) return { success: false, error: 'No track provided' };
                const trackId = track.id || ('t_' + Date.now());
                const emit = (d) => window.stash.download._emit({ trackId, ...d });

                emit({ progress: 20, status: 'downloading', source: 'arcod' });

                try {
                    // Resolve high-resolution audio stream
                    const streamInfo = await window.stash.music.getStreamUrl(track);
                    if (!streamInfo || !streamInfo.url) {
                        emit({ progress: 0, status: 'failed', source: 'unknown' });
                        return { success: false, error: 'Could not resolve audio stream' };
                    }

                    emit({ progress: 60, status: 'downloading', source: streamInfo.source || 'arcod' });

                    const isLossless = streamInfo.source === 'arcod' || (streamInfo.quality && streamInfo.quality.toLowerCase().includes('flac'));
                    const format = isLossless ? 'flac' : 'mp3';
                    const dlUrl = `/api/download?url=${encodeURIComponent(streamInfo.url)}&title=${encodeURIComponent(track.title || 'Track')}&artist=${encodeURIComponent(track.artist || 'Artist')}&format=${format}`;

                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = dlUrl;
                    a.download = `${track.artist || 'Artist'} - ${track.title || 'Track'}.${format}`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 2000);

                    emit({ progress: 100, status: 'completed', source: streamInfo.source || 'arcod' });
                    return { success: true, source: streamInfo.source || 'arcod', format };
                } catch (err) {
                    console.error('[Web Download Error]', err);
                    emit({ progress: 0, status: 'failed', error: err.message });
                    return { success: false, error: err.message };
                }
            },
            async cancel() { },
        },

        /* ── Lyrics ──────────────────────────────────────────────────── */
        lyrics: {
            fetch: async (title, artist) => {
                try {
                    const res = await fetch(`/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
                    if (res.ok) return res.json();
                } catch (e) { }
                return null;
            },
        },

        /* ── yt-dlp ──────────────────────────────────────────────────── */
        ytdlp: {
            ensure: async () => { throw new Error('yt-dlp requires the desktop app'); },
        },

        /* ── File system ─────────────────────────────────────────────── */
        fs: {
            selectFolder: async () => { throw new Error('File system requires the desktop app'); },
            openFolder: async () => { throw new Error('File system requires the desktop app'); },
            getFileUrl: async (path) => path,
        },

        /* ── App ─────────────────────────────────────────────────────── */
        app: {
            getPath: async () => '/',
            getVersion: async () => '1.0.0-web',
            openExternal: (url) => { window.open(url, '_blank'); },
        },

        /* ── ARCOD (Direct In-Web Authentication & Management) ────────── */
        arcod: {
            login: async (credentials) => {
                if (credentials && credentials.email && credentials.password) {
                    try {
                        const res = await fetch('/api/arcod/auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: credentials.action || 'login',
                                email: credentials.email,
                                password: credentials.password,
                            }),
                        });
                        const data = await res.json();
                        if (res.ok && data.success && data.session) {
                            saveArcodSession(data.session);
                            return { success: true, session: data.session };
                        }
                        return { success: false, error: data.error || 'Authentication failed' };
                    } catch (err) {
                        return { success: false, error: err.message };
                    }
                }
                return showArcodLoginModal();
            },
            getStatus: async () => {
                const session = getStoredArcodSession();
                const stashKey = localStorage.getItem('creds_arcod_stashkey');
                return {
                    connected: !!session?.accessToken,
                    userEmail: session?.userEmail || (session?.accessToken ? 'Authenticated User' : null),
                    expiresAt: session?.expiresAt || null,
                    stashKeyConfigured: !!stashKey,
                };
            },
            disconnect: async () => {
                removeArcodSession();
                return true;
            },
            saveToken: async (rawToken) => {
                if (!rawToken || !rawToken.trim()) return { success: false, error: 'Token is empty' };
                let str = rawToken.trim();
                if (str.startsWith('"') && str.endsWith('"')) {
                    str = str.slice(1, -1);
                }
                str = str.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').trim();
                if (str.startsWith('base64-')) {
                    try { str = atob(str.substring(7)); } catch (e) { }
                }

                let session = null;
                try {
                    const obj = JSON.parse(str);
                    const accessToken = obj.access_token || obj.accessToken || '';
                    const refreshToken = obj.refresh_token || obj.refreshToken || '';
                    const expiresAt = obj.expires_at ? Number(obj.expires_at) * 1000 : (obj.expiresAt ? Number(obj.expiresAt) : Date.now() + 3600 * 1000);
                    const userEmail = obj.user?.email || obj.email || 'ARCOD Connected';

                    if (accessToken) {
                        session = { accessToken, refreshToken, expiresAt, userEmail };
                    }
                } catch (e) {
                    // Regex fallback
                    const accessMatch = str.match(/"access_token"\s*:\s*"([^"]+)"/);
                    const refreshMatch = str.match(/"refresh_token"\s*:\s*"([^"]+)"/);
                    if (accessMatch && accessMatch[1]) {
                        session = {
                            accessToken: accessMatch[1],
                            refreshToken: refreshMatch ? refreshMatch[1] : '',
                            expiresAt: Date.now() + 3600 * 1000,
                            userEmail: 'ARCOD Connected'
                        };
                    }
                }

                if (!session) {
                    session = { accessToken: str, userEmail: 'ARCOD Connected' };
                }

                // Proactively refresh if refresh token is present to guarantee a fresh, valid token
                if (session.refreshToken) {
                    try {
                        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';
                        const refRes = await fetch('https://fnlghyzwyoklfqyhqlav.supabase.co/auth/v1/token?grant_type=refresh_token', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': anonKey,
                                'Authorization': `Bearer ${anonKey}`
                            },
                            body: JSON.stringify({ refresh_token: session.refreshToken })
                        });
                        if (refRes.ok) {
                            const fresh = await refRes.json();
                            if (fresh.access_token) {
                                session.accessToken = fresh.access_token;
                                if (fresh.refresh_token) session.refreshToken = fresh.refresh_token;
                                if (fresh.expires_at) session.expiresAt = Number(fresh.expires_at) * 1000;
                                if (fresh.user?.email) session.userEmail = fresh.user.email;
                            }
                        }
                    } catch (e) {
                        console.warn('[ARCOD] Supabase refresh warning:', e);
                    }
                }

                saveArcodSession(session);
                return { success: true, session };
            },
            setStashKey: async (key) => {
                if (key && key.trim()) {
                    localStorage.setItem('creds_arcod_stashkey', key.trim());
                } else {
                    localStorage.removeItem('creds_arcod_stashkey');
                }
                return { success: true };
            },
            searchAlbums: async (query, limit) => {
                try {
                    const session = getStoredArcodSession();
                    const headers = {};
                    if (session?.accessToken) headers['x-arcod-token'] = session.accessToken;
                    const res = await fetch(`/api/arcod/search?q=${encodeURIComponent(query)}&limit=${limit || 10}`, { headers });
                    if (res.ok) {
                        const data = await res.json();
                        return data.tracks || [];
                    }
                } catch (e) { }
                return [];
            },
        },
    };
}

console.log('[Bubble Web] Stash polyfill ready. ARCOD In-Web Auth enabled.');
