/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Settings View
   Includes ARCOD lossless routing, Spotify & YT accounts,
   Audio quality, Equalizer, and Storage configuration
   ═══════════════════════════════════════════════════════════════════ */

BubbleRouter.register('settings', async (container) => {
  const settings = await BubbleSettings.load();
  await BubbleSpotify.checkConnection();
  const spConnected = BubbleSpotify.isConnected();
  const ytConnected = BubbleYouTube.isConnected();
  const arcodStatus = (typeof stash !== 'undefined' ? await stash.arcod.getStatus().catch(() => ({ connected: false })) : { connected: false });
  const arcodConnected = arcodStatus.connected;
  const stashKeyConfigured = arcodStatus.stashKeyConfigured;
  const disableLossless = settings['disable_lossless'] === 'true' || settings['prefer_source'] === 'youtube';
  const allowYouTubeStream = settings['allow_youtube_stream'] !== 'false';
  const downloadDir = settings['download_dir'] || 'Music/Stash';
  const appVersion = (typeof stash !== 'undefined' ? await stash.app.getVersion().catch(() => '1.0.0') : '1.0.0-web');
  const currentEQPreset = settings['eq_preset'] || 'flat';
  const currentEQBands = JSON.parse(settings['eq_bands'] || '[0,0,0,0,0]');
  const crossfade = settings['crossfade_duration'] || '0';
  const normalize = settings['normalize_volume'] === 'true';
  const syncMixes = settings['sync_mixes'] === 'true';

  container.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Settings</h1>
      <p class="view-subtitle">Accounts, audio engine, lossless routing, and storage</p>
    </div>

    <div class="settings-container">

      <!-- ═══ ROUTING CONFIGURATION (ARCOD) ═══ -->
      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          Audio Routing & Lossless Sources
        </div>

        <div class="card" style="margin-bottom:var(--space-md);background:linear-gradient(135deg, rgba(34,197,94,0.08), rgba(0,0,0,0.85));border:1px solid rgba(34,197,94,0.2)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="font-family:monospace;font-size:11px;color:var(--text-tertiary);letter-spacing:1.5px;text-transform:uppercase">
              PRIMARY LOSSLESS ENGINE (ARCOD 24-BIT FLAC)
            </div>
            <span class="badge ${arcodConnected ? 'badge-accent' : 'badge-subtle'}" style="font-size:10px">
              ${arcodConnected ? '● ARCOD ACTIVE' : '○ ARCOD READY'}
              ${stashKeyConfigured ? ' · FAST ROUTE ON' : ''}
            </span>
          </div>

          <p style="font-size:var(--font-xs);color:var(--text-secondary);margin:0 0 16px 0;line-height:1.5">
            Lossless audio streams via ARCOD high-resolution engine. Bit-depth up to <strong>24-Bit / 192kHz FLAC</strong>. Tracks not available on ARCOD automatically fallback to YouTube Music.
          </p>

          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:rgba(0,0,0,0.3);border-radius:var(--radius-md);border:1px solid var(--surface-glass-border)">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg, #22c55e, #4ade80);display:flex;align-items:center;justify-content:center;font-weight:800;color:#000;font-size:16px;box-shadow:0 0 12px rgba(34,197,94,0.4)">
                A
              </div>
              <div>
                <div style="font-size:var(--font-sm);font-weight:600;display:flex;align-items:center;gap:8px">
                  ARCOD — ${arcodConnected ? 'Connected' : 'Not Connected'}
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${arcodConnected ? '#00e676' : '#ff5252'};box-shadow:0 0 6px ${arcodConnected ? '#00e676' : '#ff5252'}"></span>
                </div>
                <div style="font-size:var(--font-xs);color:var(--text-tertiary)">
                  ${arcodConnected ? (arcodStatus.userEmail || 'Authenticated Session') : 'Sign in on arcod.xyz to activate direct 24-bit Hi-Res routing'}
                </div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px">
              ${arcodConnected ? `
                <button class="btn btn-secondary btn-sm" onclick="(window.stash||stash).arcod.disconnect().then(() => { BubbleApp.toast('ARCOD disconnected', 'info'); BubbleRouter.navigate('settings', {force:true}); })">Disconnect</button>
              ` : `
                <button class="btn btn-secondary btn-sm" onclick="(window.stash||stash).app.openExternal('https://arcod.xyz/')">Get Token from ARCOD</button>
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('arcod-token-panel').classList.toggle('visible')">Paste Token</button>
              `}
              <button class="btn btn-ghost btn-sm" title="${stashKeyConfigured ? 'Fast stream route is configured' : 'Optional private key for the fast stream route'}" onclick="document.getElementById('arcod-stashkey-panel').classList.toggle('visible')">${stashKeyConfigured ? '✓ Stash Key' : 'Stash Key'}</button>
            </div>
          </div>

          <div id="arcod-stashkey-panel" class="cookie-input-wrapper card" style="margin-top:var(--space-md)">
            <div style="font-size:var(--font-xs);color:var(--text-secondary);margin-bottom:10px;line-height:1.6">
              <strong>Private /v2/stash Integration Key (optional):</strong><br>
              The arcod operator's per-build <code>X-Stash-Key</code> unlocks the <strong>fast single-GET stream route</strong> (api.arcod.xyz/v2/stash/stream) — instant playback with no server-side render/poll. Without it, lossless streams still work via the job-render flow using your ARCOD session. Set the <code>ARCOD_STASH_KEY</code> env var or paste it below:
            </div>
            <input type="text" id="arcod-stashkey-input" class="cookie-textarea" style="min-height:auto;padding:10px 12px" placeholder="Paste your X-Stash-Key...">
            <div class="cookie-actions">
              <button class="btn btn-primary btn-sm" onclick="(window.stash||stash).arcod.setStashKey(document.getElementById('arcod-stashkey-input').value).then(() => { BubbleApp.toast('Stash key saved', 'success'); BubbleRouter.navigate('settings', {force:true}); })">Save Key</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('arcod-stashkey-panel').classList.remove('visible')">Cancel</button>
            </div>
          </div>

          <div id="arcod-token-panel" class="cookie-input-wrapper card" style="margin-top:var(--space-md)">
            <div style="font-size:var(--font-xs);color:var(--text-secondary);margin-bottom:10px;line-height:1.6">
              <strong>Quick Browser Sign-In:</strong><br>
              1. Click <a href="#" style="color:var(--accent)" onclick="(window.stash||stash).app.openExternal('https://arcod.xyz/'); return false;">Open in Browser</a> and sign in with Google or Email.<br>
              2. Press <code>F12</code> (or right-click → Inspect) → click the <strong>Console</strong> tab.<br>
              3. Paste this command and press Enter: <code style="user-select:all;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px">copy(localStorage.getItem('sb-fnlghyzwyoklfqyhqlav-auth-token'))</code><br>
              4. Paste the copied token below and click <strong>Save & Connect</strong>:
            </div>
            <textarea id="arcod-token-input" class="cookie-textarea" placeholder='Paste your copied token here...'></textarea>
            <div class="cookie-actions">
              <button class="btn btn-primary btn-sm" onclick="(window.stash||stash).arcod.saveToken(document.getElementById('arcod-token-input').value).then(res => { if(res.success) { BubbleApp.toast('ARCOD token saved!', 'success'); BubbleRouter.navigate('settings', {force:true}); } else { BubbleApp.toast(res.error || 'Invalid token', 'error'); } })">Save & Connect</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('arcod-token-panel').classList.remove('visible')">Cancel</button>
            </div>
          </div>

          <!-- Lossless Audio Streaming (ARCOD FLAC vs YouTube Music) Toggle -->
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--surface-glass-border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:var(--font-sm);font-weight:600;display:flex;align-items:center;gap:6px">
                Lossless Audio Streaming (ARCOD FLAC)
                <span class="badge ${!disableLossless ? 'badge-accent' : 'badge-yellow'}" style="font-size:10px">
                  ${!disableLossless ? '● LOSSLESS FLAC (ACTIVE)' : '○ YOUTUBE MUSIC (ACTIVE)'}
                </span>
              </div>
              <div style="font-size:var(--font-xs);color:var(--text-tertiary);margin-top:2px">
                ${!disableLossless ? 'Streaming bit-perfect 24-Bit FLAC via ARCOD/Qobuz. Turn off to stream directly from YouTube Music.' : 'Lossless is turned OFF. Streaming audio directly from YouTube Music standard quality.'}
              </div>
            </div>
            <label class="toggle">
              <input type="checkbox" ${!disableLossless ? 'checked' : ''} onchange="BubbleSettings.set('disable_lossless', this.checked ? 'false' : 'true').then(() => { BubbleApp.toast(this.checked ? 'Lossless FLAC streaming enabled' : 'Lossless turned OFF (YouTube Music source enabled)', 'info'); BubbleRouter.navigate('settings', {force:true}); })">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- YouTube Music Streaming Fallback Toggle -->
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;${disableLossless ? 'opacity:0.5;pointer-events:none' : ''}">
            <div>
              <div style="font-size:var(--font-sm);font-weight:600;display:flex;align-items:center;gap:6px">
                YouTube Music Streaming Fallback
                <span class="badge ${allowYouTubeStream ? 'badge-subtle' : 'badge-accent'}" style="font-size:10px">
                  ${allowYouTubeStream ? 'ALLOWED' : 'DISABLED (STRICT LOSSLESS)'}
                </span>
              </div>
              <div style="font-size:var(--font-xs);color:var(--text-tertiary);margin-top:2px">
                When disabled, Bubble will strictly only play Lossless FLAC from ARCOD and never fall back to YouTube
              </div>
            </div>
            <label class="toggle">
              <input type="checkbox" ${allowYouTubeStream ? 'checked' : ''} onchange="BubbleSettings.set('allow_youtube_stream', this.checked ? 'true' : 'false').then(() => { BubbleApp.toast(this.checked ? 'YouTube fallback enabled' : 'Strict Lossless Mode enabled (YouTube disabled)', 'info'); BubbleRouter.navigate('settings', {force:true}); })">
              <span class="toggle-slider"></span>
            </label>
          </div>

        </div>
      </div>

      <!-- ═══ CONNECTED SERVICES ═══ -->
      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Streaming Accounts (Library Import)
        </div>

        <!-- Spotify Account -->
        <div class="account-card">
          <div class="account-icon spotify">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.217.355-.678.47-1.033.253-2.83-1.73-6.393-2.12-10.59-1.162-.405.093-.81-.16-.902-.566-.093-.406.16-.81.566-.903 4.59-1.047 8.528-.606 11.705 1.344.356.217.47.678.254 1.034zm1.467-3.26c-.274.444-.86.588-1.304.314-3.24-1.99-8.18-2.567-12.012-1.403-.497.15-1.025-.133-1.176-.63-.152-.497.133-1.025.63-1.177 4.382-1.33 9.824-.688 13.548 1.592.444.274.588.86.314 1.304zm.126-3.41c-3.885-2.307-10.29-2.52-14.004-1.393-.596.18-1.226-.157-1.407-.753-.18-.596.157-1.227.753-1.407 4.268-1.296 11.332-1.045 15.82 1.62.536.318.71 1.01.392 1.546-.318.536-1.01.71-1.554.387z"/></svg>
          </div>
          <div class="account-info">
            <div class="account-name">Spotify</div>
            <div class="account-status">
              <span class="status-dot ${spConnected ? 'connected' : 'disconnected'}"></span>
              ${spConnected ? 'Connected to Spotify' : 'Not connected'}
            </div>
          </div>
          <div class="account-actions">
            ${spConnected ? `
              <button class="btn btn-secondary btn-sm" onclick="BubbleSpotify.disconnect().then(() => BubbleRouter.navigate('settings', {force:true}))">Disconnect</button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="BubbleSpotify.loginInApp().then(res => { if(res && res.success) { BubbleApp.syncNow(); BubbleRouter.navigate('settings', {force:true}); } })">Login with Spotify</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('sp-cookie-panel').classList.toggle('visible')">Paste Cookie</button>
            `}
          </div>
        </div>

        <div id="sp-cookie-panel" class="cookie-input-wrapper card" style="margin-bottom:var(--space-lg)">
          <div style="font-size:var(--font-xs);color:var(--text-secondary);margin-bottom:8px">
            Paste your <code>sp_dc</code> cookie from Spotify Web Player:
          </div>
          <textarea id="sp-cookie-input" class="cookie-textarea" placeholder="AQB..."></textarea>
          <div class="cookie-actions">
            <button class="btn btn-primary btn-sm" onclick="BubbleSpotify.loginWithCookie(document.getElementById('sp-cookie-input').value).then(ok => { if(ok) BubbleRouter.navigate('settings', {force:true}); })">Save & Connect</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('sp-cookie-panel').classList.remove('visible')">Cancel</button>
          </div>
        </div>

        <!-- YouTube Music Account -->
        <div class="account-card">
          <div class="account-icon youtube">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-11.872c-2.634 0-4.768 2.134-4.768 4.768 0 2.634 2.134 4.768 4.768 4.768 2.634 0 4.768-2.134 4.768-4.768 0-2.634-2.134-4.768-4.768-4.768zm-1.584 6.648V8.12l4.152 2.38-4.152 2.38z"/></svg>
          </div>
          <div class="account-info">
            <div class="account-name">YouTube Music</div>
            <div class="account-status">
              <span class="status-dot ${ytConnected ? 'connected' : 'disconnected'}"></span>
              ${ytConnected ? 'Connected via session cookie' : 'Not connected'}
            </div>
          </div>
          <div class="account-actions">
            ${ytConnected ? `
              <button class="btn btn-secondary btn-sm" onclick="BubbleYouTube.disconnect().then(() => BubbleRouter.navigate('settings', {force:true}))">Disconnect</button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="BubbleYouTube.loginInApp().then(res => { if(res.success) BubbleRouter.navigate('settings', {force:true}); })">Login In-App</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('yt-cookie-panel').classList.toggle('visible')">Paste Cookie</button>
            `}
          </div>
        </div>

        <div id="yt-cookie-panel" class="cookie-input-wrapper card" style="margin-bottom:var(--space-lg)">
          <div style="font-size:var(--font-xs);color:var(--text-secondary);margin-bottom:8px">
            Paste your raw cookie string from <code>music.youtube.com</code>:
          </div>
          <textarea id="yt-cookie-input" class="cookie-textarea" placeholder="SAPISID=...; LOGIN_INFO=..."></textarea>
          <div class="cookie-actions">
            <button class="btn btn-primary btn-sm" onclick="BubbleYouTube.loginWithCookie(document.getElementById('yt-cookie-input').value).then(ok => { if(ok) BubbleRouter.navigate('settings', {force:true}); })">Save & Connect</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('yt-cookie-panel').classList.remove('visible')">Cancel</button>
          </div>
        </div>
      </div>

      <!-- ═══ AUDIO & PLAYBACK ENGINE ═══ -->
      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          Audio & Equalizer
        </div>

        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Download Audio Format</div>
              <div class="settings-row-desc">Bit-perfect Lossless (FLAC via Qobuz) with automatic YouTube fallback</div>
            </div>
            <select class="select-field" onchange="BubbleSettings.set('audio_quality', this.value)">
              <option value="flac" selected>Lossless FLAC (Highest)</option>
              <option value="mp3_320">320kbps MP3</option>
              <option value="opus">Opus Audio</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Volume Normalization</div>
              <div class="settings-row-desc">Keeps the playback volume consistent across all tracks</div>
            </div>
            <label class="toggle">
              <input type="checkbox" ${normalize ? 'checked' : ''} onchange="BubbleSettings.set('normalize_volume', this.checked ? 'true' : 'false')">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Crossfade Tracks</div>
              <div class="settings-row-desc">Smooth transition between ending and starting tracks</div>
            </div>
            <select class="select-field" onchange="BubbleSettings.set('crossfade_duration', this.value)">
              <option value="0" ${crossfade === '0' ? 'selected' : ''}>Off</option>
              <option value="2" ${crossfade === '2' ? 'selected' : ''}>2 seconds</option>
              <option value="4" ${crossfade === '4' ? 'selected' : ''}>4 seconds</option>
              <option value="6" ${crossfade === '6' ? 'selected' : ''}>6 seconds</option>
            </select>
          </div>
        </div>

        <!-- 5-Band Equalizer Widget -->
        <div class="card" style="margin-top:var(--space-lg)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-lg)">
            <div>
              <div style="font-size:var(--font-sm);font-weight:600">5-Band Equalizer</div>
              <div style="font-size:var(--font-xs);color:var(--text-tertiary)">Fine-tune your sound output</div>
            </div>
            <select class="select-field" id="eq-preset-select" onchange="applyEQPreset(this.value)">
              <option value="flat" ${currentEQPreset === 'flat' ? 'selected' : ''}>Flat</option>
              <option value="rock" ${currentEQPreset === 'rock' ? 'selected' : ''}>Rock</option>
              <option value="pop" ${currentEQPreset === 'pop' ? 'selected' : ''}>Pop</option>
              <option value="jazz" ${currentEQPreset === 'jazz' ? 'selected' : ''}>Jazz</option>
              <option value="classical" ${currentEQPreset === 'classical' ? 'selected' : ''}>Classical</option>
              <option value="bass_boost" ${currentEQPreset === 'bass_boost' ? 'selected' : ''}>Bass Boost</option>
              <option value="treble_boost" ${currentEQPreset === 'treble_boost' ? 'selected' : ''}>Treble Boost</option>
              <option value="vocal" ${currentEQPreset === 'vocal' ? 'selected' : ''}>Vocal</option>
            </select>
          </div>

          <div style="display:flex;justify-content:space-around;padding:var(--space-md) 0">
            ${BubblePlayer.EQ_LABELS.map((label, idx) => `
              <div class="eq-band" style="display:flex;flex-direction:column;align-items:center;gap:8px">
                <input type="range" class="eq-slider" id="eq-slider-${idx}" min="-12" max="12" step="1" value="${currentEQBands[idx] || 0}" oninput="onEQSliderChange(${idx}, this.value)">
                <span class="eq-label">${label}Hz</span>
                <span id="eq-val-${idx}" style="font-size:10px;color:var(--text-secondary)">${currentEQBands[idx] > 0 ? '+' : ''}${currentEQBands[idx] || 0}dB</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- ═══ STORAGE & DOWNLOAD DIRECTORY ═══ -->
      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Storage & Sync
        </div>

        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Download Folder</div>
              <div class="settings-row-desc">Location where lossless FLAC files are saved</div>
            </div>
            <div class="folder-selector">
              <span class="folder-path" id="setting-folder-display">${escapeHtml(downloadDir)}</span>
              <button class="btn btn-secondary btn-sm" onclick="changeDownloadFolder()">Browse</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Concurrent Downloads</div>
              <div class="settings-row-desc">Number of tracks to download simultaneously</div>
            </div>
            <select class="select-field" onchange="BubbleSettings.set('concurrent_downloads', this.value)">
              <option value="1" ${settings['concurrent_downloads'] === '1' ? 'selected' : ''}>1 track</option>
              <option value="2" ${settings['concurrent_downloads'] === '2' ? 'selected' : ''}>2 tracks (Recommended)</option>
              <option value="3" ${settings['concurrent_downloads'] === '3' ? 'selected' : ''}>3 tracks</option>
              <option value="4" ${settings['concurrent_downloads'] === '4' ? 'selected' : ''}>4 tracks</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Sync Spotify Mixes</div>
              <div class="settings-row-desc">Also import Spotify's auto-generated mixes (Daily Mix, Discover Weekly, Release Radar…). Off = your own playlists only.</div>
            </div>
            <label class="toggle">
              <input type="checkbox" ${syncMixes ? 'checked' : ''} onchange="BubbleSettings.set('sync_mixes', this.checked ? 'true' : 'false').then(() => BubbleApp.toast(this.checked ? 'Spotify Mixes will be imported on next sync' : 'Spotify Mixes sync disabled — playlists only', 'info'))">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- ═══ APP & ACCOUNT SYSTEM ═══ -->
      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          App & Account System
        </div>

        <div class="settings-group">
          <div class="settings-row" id="btn-pwa-install" style="display: none; cursor: pointer;" onclick="window.installPWA()">
            <div class="settings-row-info">
              <div class="settings-row-label">Install Web App</div>
              <div class="settings-row-desc">Install Bubble as a standalone app on your device</div>
            </div>
            <button class="btn btn-primary btn-sm">Install</button>
          </div>

          <div class="settings-row" style="border-top: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer;" onclick="deleteBubbleAccount()">
            <div class="settings-row-info">
              <div class="settings-row-label" style="color: #ef4444;">Delete Bubble Account</div>
              <div class="settings-row-desc" style="color: rgba(239, 68, 68, 0.7);">Permanently delete your account and all synchronized data</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">Delete</button>
          </div>
        </div>
      </div>

      <!-- ═══ ABOUT SECTION ═══ -->
      <div class="settings-section">
        <div class="about-card">
          <div class="about-logo">
            <img src="icon.png" width="56" height="56" style="border-radius:14px;box-shadow:0 8px 24px var(--accent-glow);object-fit:cover" alt="Bubble">
          </div>
          <div class="about-name">Bubble</div>
          <div class="about-version">Version ${appVersion} • Built for Windows</div>
          <div class="about-desc">
            Your personal music library engine. Lossless FLAC downloads via ARCOD, lyrics from LRCLIB, built-in EQ, offline playback. No tracking, no ads.
          </div>
        </div>
      </div>

    </div>
  `;
});

async function changeDownloadFolder() {
  const chosen = (typeof stash !== 'undefined') ? await stash.fs.selectFolder().catch(() => null) : null;
  if (chosen) {
    await BubbleSettings.set('download_dir', chosen);
    const el = document.getElementById('setting-folder-display');
    if (el) el.textContent = chosen;
    BubbleApp.toast('Download folder updated', 'success');
  }
}

function applyEQPreset(preset) {
  const values = BubblePlayer.setEQPreset(preset);
  values.forEach((v, i) => {
    const slider = document.getElementById(`eq-slider-${i}`);
    const valText = document.getElementById(`eq-val-${i}`);
    if (slider) slider.value = v;
    if (valText) valText.textContent = `${v > 0 ? '+' : ''}${v}dB`;
  });
  BubbleSettings.set('eq_preset', preset);
  BubbleSettings.set('eq_bands', JSON.stringify(values));
}

function onEQSliderChange(idx, val) {
  const v = parseInt(val);
  BubblePlayer.setEQ(idx, v);
  const valText = document.getElementById(`eq-val-${idx}`);
  if (valText) valText.textContent = `${v > 0 ? '+' : ''}${v}dB`;
  const currentBands = BubblePlayer.getEQ();
  BubbleSettings.set('eq_bands', JSON.stringify(currentBands));
  BubbleSettings.set('eq_preset', 'custom');
  const presetSelect = document.getElementById('eq-preset-select');
  if (presetSelect) presetSelect.value = 'custom';
}

window.deleteBubbleAccount = async () => {
  const confirm1 = confirm("Are you sure you want to permanently delete your Bubble account? This action cannot be undone.");
  if (!confirm1) return;
  const confirm2 = confirm("Please confirm again. ALL your synced library data and integrations will be permanently wiped.");
  if (!confirm2) return;

  BubbleApp.toast("Initiating account deletion...", "info");
  try {
    const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
    if (res.ok) {
      BubbleApp.toast("Account deleted successfully.", "success");
      if (window.BubbleAPI && window.BubbleAPI.auth) {
        await window.BubbleAPI.auth.signOut();
      } else {
        localStorage.removeItem('supabase.auth.token');
      }
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      BubbleApp.toast("Failed to delete account: " + (data.error || "Unknown error"), "error");
    }
  } catch (e) {
    BubbleApp.toast("Network error while deleting account.", "error");
  }
};
