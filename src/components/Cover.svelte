<script>
  // Copertina simulata: un colore stabile per ogni prodotto e l'iniziale del nome.
  // In futuro qui potrà comparire l'immagine reale della copertina.
  import Icon from './Icon.svelte';

  let { item, size = '' } = $props();

  const PALETTE = ['#3E8E7E', '#C0654F', '#C9973A', '#6C5BA7', '#2F7EA1', '#B5577A', '#7A9A3A', '#4F6D9A'];
  const ARTICLES = ['Il', 'La', 'Lo', 'I', 'Gli', 'Le', 'Un', 'Una', 'Uno'];

  function colorFor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function initial(name) {
    const words = String(name || '?').split(/\s+/).filter((w) => !ARTICLES.includes(w));
    return (words[0] || name || '?')[0].toUpperCase();
  }
  const isFree = $derived(!item || item.free || (!item.product_id && !item.id));
</script>

{#if isFree}
  <div class="cover free {size}" aria-hidden="true"><Icon name="edit_note" /></div>
{:else}
  <div class="cover {size}" style="--c:{colorFor(item.product_id || item.id)}" aria-hidden="true">{initial(item.name)}</div>
{/if}
