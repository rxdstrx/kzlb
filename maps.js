const mapsBody = document.getElementById('maps-body');

ALL_MAPS.forEach((map, index) => {
  const i = index + 1;
  const tr = document.createElement('tr');
  const rankClass = i === 1 ? 'top1' : i === 2 ? 'top2' : i === 3 ? 'top3' : '';
  tr.innerHTML = `
    <td><span class="rank ${rankClass}">${i}</span></td>
    <td>
        <div class="map-name-cell">
          ${map.img ? `<img class="map-thumb" src="${map.img}" alt="${map.name}">` : '<div class="map-thumb map-thumb-empty"></div>'}
          <span class="mapname-cell">${map.name}</span>
        </div>
      </td>
    <td><span class="tier-badge tier-${map.tier}">${map.tier}</span></td>
    <td><span class="time-cell">—</span></td>
  `;
  mapsBody.appendChild(tr);
});
