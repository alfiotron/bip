<script>
  import Icon from '../../components/Icon.svelte';
  import { app } from '../../lib/state.svelte.js';
  let { onclose, backLabel } = $props();
</script>

<div class="abody"><div class="narrow" style="max-width:620px">
  <div class="shead"><button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>{backLabel}</span></button><h2>Fatture in Cloud</h2></div>
  <div class="panel">
    <p style="margin:0 0 12px">Questa cassa non è ancora collegata a Fatture in Cloud.</p>
    <p class="hint" style="margin:0 0 16px">Il collegamento si fa una volta sola, dalla scheda Impostazioni, incollando il token generato in Fatture in Cloud.</p>
    <button type="button" class="solid" onclick={() => (app.screen = 'impostazioni')}><Icon name="settings" /><span>Vai alle impostazioni</span></button>
  </div>
</div></div>
