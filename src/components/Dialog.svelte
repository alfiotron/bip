<script>
  // Finestra in primo piano, centrata sullo schermo (per esempio per mostrare un codice).
  // Con sheet, su schermi stretti si apre dal basso, come un pannello da sfiorare con il pollice.
  let { onclose, children, label = '', sheet = false } = $props();
  function key(e) {
    if (e.key === 'Escape' && onclose) onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="dlg-back" class:sheet role="presentation" onclick={(e) => e.target === e.currentTarget && onclose && onclose()}>
  <div class="dlg" role="dialog" aria-modal="true" aria-label={label}>
    {@render children()}
  </div>
</div>
