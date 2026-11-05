// The "?" button: a plain how-to dialog. The text lives in index.html.
el('help-btn').onclick = () => el('help-sheet').showModal()
el('help-close').onclick = () => el('help-sheet').close()
