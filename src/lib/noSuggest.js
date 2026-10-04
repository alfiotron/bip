// Spegne i suggerimenti del browser (testi inseriti in precedenza, correzione automatica,
// sottolineature ortografiche) in tutte le caselle di testo dell'app, anche in quelle create dopo.

function quiet(el) {
  if (el.dataset.quiet) return;
  el.dataset.quiet = '1';
  // "off" spegne l'elenco dei valori già inseriti; le password usano "new-password" per non far proporre il salvataggio
  el.setAttribute('autocomplete', el.type === 'password' ? 'new-password' : 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('spellcheck', 'false');
}

function scan(root) {
  if (root.matches?.('input, textarea')) quiet(root);
  root.querySelectorAll?.('input, textarea').forEach(quiet);
}

export function disableSuggestions() {
  scan(document.body);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
  }).observe(document.body, { childList: true, subtree: true });
}
