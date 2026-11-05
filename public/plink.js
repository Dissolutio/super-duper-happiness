// Player names that link to the player's page, wherever a name is shown (map card, landings, phalanx list).
// Needs app.js (esc), chat.js (showView) and player.js (openPlayer). Use playerLink(id, name) to build one; one click handler serves them all.
const playerLink = (id, name) => `<a href="#" class="plink" data-id="${esc(id)}">${esc(name)}</a>`

document.addEventListener('click', (e) => {
  const a = e.target.closest('a.plink')
  if (!a) return
  e.preventDefault()
  if (typeof closeFullMap === 'function') closeFullMap() // a full-screen map would hide the page
  showView('players')
  openPlayer(a.dataset.id)
})
