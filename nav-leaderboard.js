// Populates the navbar's Leaderboard dropdown (Main / Country) and marks the
// correct item active depending on which page we're on.
(function () {
  function init() {
    const trigger   = document.getElementById('navLbTrigger');
    const mainItem  = document.getElementById('navLbMainItem');
    const ctToggle  = document.getElementById('navLbCountryToggle');
    const ctList    = document.getElementById('navLbCountryList');
    if (!trigger || !ctList) return;

    // Populate the scrollable country list once
    const countries = window.KZ_COUNTRIES || [];
    ctList.innerHTML = countries.map(c =>
      `<a href="${c.code}.html" class="nav-lb-country-item" data-code="${c.code}">
        <span class="nav-lb-country-flag">${c.flag}</span>
        <span>${c.name}</span>
      </a>`
    ).join('');

    ctToggle.addEventListener('click', () => {
      ctList.classList.toggle('open');
      ctToggle.classList.toggle('open');
    });

    const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
    const currentCountry = window.COUNTRY_CODE || new URLSearchParams(location.search).get('code') || null;

    if (currentCountry) {
      const info = countries.find(c => c.code === currentCountry);
      const label = info ? info.name : currentCountry.toUpperCase();
      trigger.childNodes[0].textContent = `Leaderboard (${label}) `;
      trigger.classList.add('active');
      ctToggle.classList.add('active', 'open');
      ctList.classList.add('open');
      const activeLink = ctList.querySelector(`[data-code="${currentCountry}"]`);
      if (activeLink) {
        activeLink.classList.add('active');
        requestAnimationFrame(() => activeLink.scrollIntoView({ block: 'center' }));
      }
    } else if (page === 'leaderboard') {
      trigger.classList.add('active');
      if (mainItem) mainItem.classList.add('active');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
