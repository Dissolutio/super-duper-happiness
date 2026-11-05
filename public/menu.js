// The header menu (hamburger): Help, Alerts, Change name, Sign out. Each item has its own handler elsewhere; this only opens and closes the panel.
const menuPanel = el('menu')
function setMenu(open) {
  menuPanel.hidden = !open
  el('menu-btn').setAttribute('aria-expanded', String(open))
}
el('menu-btn').onclick = () => setMenu(menuPanel.hidden)
menuPanel.onclick = () => setMenu(false) // after the tapped item has done its job
document.addEventListener('click', (e) => { if (!menuPanel.hidden && !e.target.closest('#menu, #menu-btn')) setMenu(false) })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false) })
