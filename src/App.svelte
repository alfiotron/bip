<script>
  import { onMount } from 'svelte';
  import Cassa from './screens/Cassa.svelte';
  import Prodotti from './screens/Prodotti.svelte';
  import Eventi from './screens/Eventi.svelte';
  import Impostazioni from './screens/Impostazioni.svelte';
  import Dotazione from './screens/Dotazione.svelte';
  import Ddt from './screens/Ddt.svelte';
  import Statistiche from './screens/Statistiche.svelte';
  import { app, init, productByCode } from './lib/state.svelte.js';
  import { dz } from './lib/dotazione.svelte.js';
  import { ddtScan } from './lib/ddt.svelte.js';
  import { startScanner } from './lib/scanner.js';
  import { scan } from './lib/pos.svelte.js';
  import { productsScan } from './lib/products.svelte.js';

  onMount(() => {
    init();
    // Lo scanner funziona ovunque; cosa fa dipende dalla schermata aperta.
    return startScanner((code) => {
      if (!app.ready) return;
      if (app.screen === 'cassa') scan(code);
      else if (app.screen === 'prodotti') productsScan(code);
      else if (app.screen === 'ddt') ddtScan(code);
      else if (app.screen === 'dotazione') {
        const p = productByCode(code);
        if (p) { dz.selected = p.id; dz.missing = ''; }
        else dz.missing = code;
      }
    });
  });
</script>

{#if app.error}
  <div class="fatal">
    <h1>La cassa non è riuscita ad avviarsi</h1>
    <p>Chiudi e riapri l'app. Se il problema continua, invia questo messaggio a chi ti assiste:</p>
    <pre>{app.error}</pre>
  </div>
{:else if !app.ready}
  <div class="loading">Avvio della cassa…</div>
{:else if app.screen === 'prodotti'}
  <Prodotti />
{:else if app.screen === 'eventi'}
  <Eventi />
{:else if app.screen === 'dotazione'}
  <Dotazione />
{:else if app.screen === 'ddt'}
  <Ddt />
{:else if app.screen === 'statistiche'}
  <Statistiche />
{:else if app.screen === 'impostazioni'}
  <Impostazioni />
{:else}
  <Cassa />
{/if}
