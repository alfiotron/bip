<script>
  // Finestra in primo piano, centrata sullo schermo (per esempio per mostrare un codice).
  let { onclose, children, label = '' } = $props();
  function key(e) {
    if (e.key === 'Escape' && onclose) onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="dlg-back" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose && onclose()}>
  <div class="dlg" role="dialog" aria-modal="true" aria-label={label}>
    {@render children()}
  </div>
</div>
