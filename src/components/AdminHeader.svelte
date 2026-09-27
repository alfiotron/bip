<script>
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte.js';
  import { ADMIN_SCREENS } from '../lib/nav.js';

  let { actions } = $props();


  let tabsEl = $state();
  $effect(() => {
    // Porta in vista la scheda attiva quando le schede scorrono (schermo stretto).
    app.screen;
    const on = tabsEl?.querySelector('.on');
    if (on && tabsEl.scrollWidth > tabsEl.clientWidth) tabsEl.scrollLeft = on.offsetLeft - (tabsEl.clientWidth - on.offsetWidth) / 2;
  });
</script>

<header class="ahead">
  <button type="button" class="back" onclick={() => (app.screen = 'cassa')}><Icon name="arrow_back" /><span>Cassa</span></button>
  <div class="tabs" role="tablist" bind:this={tabsEl}>
    {#each ADMIN_SCREENS as s (s.key)}
      <button type="button" role="tab" aria-selected={app.screen === s.key} class:on={app.screen === s.key} onclick={() => (app.screen = s.key)}>{s.label}</button>
    {/each}
  </div>
  <div class="aright">{@render actions?.()}</div>
</header>
