<script>
  import Icon from './Icon.svelte';
  import { ui, hideToast } from '../lib/ui.svelte.js';
  const ICONS = { ok: 'check_circle', err: 'error', warn: 'warning' };
</script>

{#if ui.toast}
  {@const t = ui.toast}
  <div class="toast {t.kind}" role={t.kind === 'ok' ? 'status' : 'alert'}>
    <Icon name={ICONS[t.kind]} />
    <div class="tb">
      <div class="tt">{t.title}</div>
      {#if t.detail}<div class="td">{t.detail}</div>{/if}
      {#if t.code}<div class="tc">{t.code}</div>{/if}
      {#if t.action}
        <div class="ta">
          <button type="button" onclick={() => { const run = t.action.run; hideToast(); run(); }}>{t.action.label}</button>
          {#if t.kind !== 'ok'}<button type="button" onclick={hideToast}>Ok</button>{/if}
        </div>
      {/if}
    </div>
    <button type="button" class="x" aria-label="Chiudi" onclick={hideToast}><Icon name="close" /></button>
  </div>
{/if}
