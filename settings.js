// Settings page logic.
(function () {
  const API = 'https://kzlb.vercel.app/api/change-flag';

  function getAuthSafe() {
    return typeof getAuth === 'function' ? getAuth() : null;
  }

  async function callApi(body) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function showStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.className = `settings-row-status ${kind}`;
    el.classList.remove('hidden');
  }

  // ── Tab switching ──
  function initTabs() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById(`panel-${item.dataset.panel}`)?.classList.remove('hidden');
      });
    });
  }

  // ── Country flag dropdown (same pattern as profile.js's own-profile flag changer) ──
  function initFlagDropdown(currentCountry) {
    const trigger = document.getElementById('settingsFlagTrigger');
    const label   = document.getElementById('settingsFlagLabel');
    const panel   = document.getElementById('settingsFlagPanel');
    const search  = document.getElementById('settingsFlagSearch');
    const list    = document.getElementById('settingsFlagOptions');
    if (!trigger || !list) return { getSelected: () => 'xx' };

    let selected = currentCountry || 'xx';
    const countries = [{ code: 'xx', name: 'No flag' }, ...(window.KZ_COUNTRIES || [])];

    function setLabel(code) {
      const c = countries.find(c => c.code === code);
      const name = c ? c.name : 'No flag';
      label.innerHTML = code !== 'xx'
        ? `<img src="https://flagcdn.com/w20/${code}.png" style="height:14px;border-radius:2px;vertical-align:middle;margin-right:6px">${name}`
        : name;
    }

    function build(filter = '') {
      const q = filter.toLowerCase();
      list.innerHTML = '';
      countries
        .filter(c => !q || c.name.toLowerCase().includes(q) || c.code.includes(q))
        .forEach(c => {
          const div = document.createElement('div');
          div.className = 'flag-option' + (c.code === selected ? ' selected' : '');
          const flagImg = c.code !== 'xx'
            ? `<img src="https://flagcdn.com/w20/${c.code}.png" style="height:14px;border-radius:2px;flex-shrink:0">`
            : `<span style="opacity:0.4;font-size:0.9em">🏳️</span>`;
          div.innerHTML = `${flagImg}<span>${c.name}</span>`;
          div.addEventListener('click', () => {
            selected = c.code;
            setLabel(selected);
            panel.classList.add('hidden');
            list.querySelectorAll('.flag-option').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
          });
          list.appendChild(div);
        });
    }

    setLabel(selected);
    build();
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) search?.focus();
    });
    search?.addEventListener('input', () => build(search.value));
    document.addEventListener('click', () => panel.classList.add('hidden'));
    panel.addEventListener('click', e => e.stopPropagation());

    return { getSelected: () => selected };
  }

  // ── Generic 2-option glassy dropdown (Show location / Language) ──
  function initKzSelect(wrapId, triggerId, labelId, panelId, initialValue, onChange) {
    const wrap    = document.getElementById(wrapId);
    const trigger = document.getElementById(triggerId);
    const label   = document.getElementById(labelId);
    const panel   = document.getElementById(panelId);
    if (!wrap || !trigger || !panel) return { setValue: () => {} };

    const options = panel.querySelectorAll('.kz-select-option');
    function setValue(value, fire) {
      options.forEach(o => o.classList.toggle('selected', o.dataset.value === value));
      const match = [...options].find(o => o.dataset.value === value);
      if (match && label) label.textContent = match.textContent;
      wrap.dataset.value = value;
      if (fire) onChange(value);
    }

    options.forEach(opt => {
      opt.addEventListener('click', () => {
        setValue(opt.dataset.value, true);
        panel.classList.add('hidden');
      });
    });
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });
    document.addEventListener('click', () => panel.classList.add('hidden'));
    panel.addEventListener('click', e => e.stopPropagation());

    setValue(initialValue, false);
    return { setValue: v => setValue(v, false) };
  }

  function formatCooldown(ms) {
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  async function loadSettings(auth) {
    const { ok, data } = await callApi({ token: auth.token, action: 'get-settings' });
    if (!ok || !data.ok) return null;
    return data;
  }

  async function init() {
    const auth = getAuthSafe();
    const guestEl = document.getElementById('settingsGuest');
    const wrapEl  = document.getElementById('settingsWrap');
    if (!auth) {
      guestEl?.classList.remove('hidden');
      wrapEl?.classList.add('hidden');
      return;
    }
    guestEl?.classList.add('hidden');
    wrapEl?.classList.remove('hidden');
    initTabs();

    const settings = await loadSettings(auth);
    if (!settings) return;

    // Apply saved language immediately
    if (settings.language) window.applyKzLanguage(settings.language);

    // ── Nickname ──
    const nicknameInput  = document.getElementById('nicknameInput');
    const nicknameSaveBtn = document.getElementById('nicknameSaveBtn');
    const nicknameStatus = document.getElementById('nicknameStatus');
    if (nicknameInput) nicknameInput.value = settings.nickname || '';
    if (settings.nicknameCooldownRemainingMs > 0) {
      nicknameSaveBtn.disabled = true;
      showStatus(nicknameStatus, `You can change your nickname again in ${formatCooldown(settings.nicknameCooldownRemainingMs)}.`, 'error');
    }
    nicknameSaveBtn?.addEventListener('click', async () => {
      const nickname = nicknameInput.value.trim();
      if (!nickname) return;
      nicknameSaveBtn.disabled = true;
      showStatus(nicknameStatus, 'Saving…', 'loading');
      const { ok, status, data } = await callApi({ token: auth.token, action: 'update-settings', nickname });
      if (ok && data.ok) {
        showStatus(nicknameStatus, 'Nickname updated!', 'success');
      } else {
        showStatus(nicknameStatus, data.error || 'Failed to update nickname.', 'error');
        if (status !== 429) nicknameSaveBtn.disabled = false;
      }
    });

    // ── Email ──
    const emailInput = document.getElementById('emailInput');
    const emailSaveBtn = document.getElementById('emailSaveBtn');
    const emailStatus = document.getElementById('emailStatus');
    if (emailInput) emailInput.value = settings.email || '';
    emailSaveBtn?.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      showStatus(emailStatus, 'Saving…', 'loading');
      const { ok, data } = await callApi({ token: auth.token, action: 'update-settings', email });
      showStatus(emailStatus, ok && data.ok ? 'Email updated!' : (data.error || 'Failed.'), ok && data.ok ? 'success' : 'error');
    });

    // ── Country ──
    const flagUI = initFlagDropdown(settings.country);
    const countrySaveBtn = document.getElementById('countrySaveBtn');
    const countryStatus = document.getElementById('countryStatus');
    countrySaveBtn?.addEventListener('click', async () => {
      const country = flagUI.getSelected();
      showStatus(countryStatus, 'Saving…', 'loading');
      const { ok, data } = await callApi({ token: auth.token, country });
      showStatus(countryStatus, ok && data.ok ? 'Flag updated!' : (data.error || 'Failed.'), ok && data.ok ? 'success' : 'error');
      if (ok && data.ok) {
        if (country && country !== 'xx') localStorage.setItem('kz_country', country);
        else localStorage.removeItem('kz_country');
      }
    });

    // ── Show location ──
    initKzSelect('showLocationSelect', 'showLocationTrigger', 'showLocationLabel', 'showLocationPanel',
      settings.showLocation === false ? 'no' : 'yes',
      value => callApi({ token: auth.token, action: 'update-settings', showLocation: value === 'yes' })
    );

    // ── Language ──
    initKzSelect('languageSelect', 'languageTrigger', 'languageLabel', 'languagePanel',
      settings.language || 'en',
      lang => {
        window.applyKzLanguage(lang);
        callApi({ token: auth.token, action: 'update-settings', language: lang });
      }
    );

    // ── Trade link ──
    const tradeLinkInput = document.getElementById('tradeLinkInput');
    const tradeLinkSaveBtn = document.getElementById('tradeLinkSaveBtn');
    const tradeLinkStatus = document.getElementById('tradeLinkStatus');
    if (tradeLinkInput) tradeLinkInput.value = settings.tradeLink || '';
    tradeLinkSaveBtn?.addEventListener('click', async () => {
      const tradeLink = tradeLinkInput.value.trim();
      showStatus(tradeLinkStatus, 'Saving…', 'loading');
      const { ok, data } = await callApi({ token: auth.token, action: 'update-settings', tradeLink });
      showStatus(tradeLinkStatus, ok && data.ok ? 'Trade link updated!' : (data.error || 'Failed.'), ok && data.ok ? 'success' : 'error');
    });

    // ── Confidentiality toggles (stored now, enforced later) ──
    const safeTalkingToggle = document.getElementById('safeTalkingToggle');
    const hideOnlineToggle = document.getElementById('hideOnlineToggle');
    const hideInventoryToggle = document.getElementById('hideInventoryToggle');
    if (safeTalkingToggle) {
      safeTalkingToggle.checked = settings.safeTalking !== false;
      safeTalkingToggle.addEventListener('change', () => {
        callApi({ token: auth.token, action: 'update-settings', safeTalking: safeTalkingToggle.checked });
      });
    }
    if (hideOnlineToggle) {
      hideOnlineToggle.checked = !!settings.hideOnline;
      hideOnlineToggle.addEventListener('change', () => {
        callApi({ token: auth.token, action: 'update-settings', hideOnline: hideOnlineToggle.checked });
      });
    }
    if (hideInventoryToggle) {
      hideInventoryToggle.checked = !!settings.hideInventory;
      hideInventoryToggle.addEventListener('change', () => {
        callApi({ token: auth.token, action: 'update-settings', hideInventory: hideInventoryToggle.checked });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
