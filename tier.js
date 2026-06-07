const params = new URLSearchParams(window.location.search);
const tier = parseInt(params.get('tier')) || 1;

// Set page title
document.title = `KZ Leaderboard — Tier ${tier}`;
document.getElementById('tier-title').textContent = tier;
document.getElementById('tier-subtitle').textContent = `Tier ${tier} Maps`;

// Highlight active pill
document.querySelectorAll('.tier-nav-pill').forEach(pill => {
  if (pill.href.includes(`tier=${tier}`)) pill.classList.add('active');
});

// Filter and render maps
const filtered = ALL_MAPS.filter(m => m.tier === tier);
const tbody = document.getElementById('tier-body');
const emptyState = document.getElementById('empty-state');

if (filtered.length === 0) {
  emptyState.classList.remove('hidden');
} else {
  filtered.forEach((map, index) => {
    const i = index + 1;
    const tr = document.createElement('tr');
    const rankClass = i === 1 ? 'top1' : i === 2 ? 'top2' : i === 3 ? 'top3' : '';
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td><span class="rank ${rankClass}">${i}</span></td>
      <td>
        <div class="map-name-cell">
          ${map.img ? `<img class="map-thumb" src="${map.img}" alt="${map.name}">` : '<div class="map-thumb map-thumb-empty"></div>'}
          <span class="mapname-cell">${map.name}</span>
        </div>
      </td>
      <td><span class="time-cell" style="color:rgba(129,140,248,0.7);font-size:0.78rem">View records →</span></td>
    `;
    tr.addEventListener('click', () => {
      window.location.href = `map.html?map=${encodeURIComponent(map.name)}`;
    });
    tbody.appendChild(tr);
  });
}
