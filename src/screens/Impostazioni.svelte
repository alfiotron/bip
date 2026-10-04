<script>
  import { reveal } from '../lib/reveal.js';
  import Icon from '../components/Icon.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import FicSettings from './impostazioni/FicSettings.svelte';
  import ShopSettings from './impostazioni/ShopSettings.svelte';
  import MailSettings from './impostazioni/MailSettings.svelte';
  import ResetPanel from './impostazioni/ResetPanel.svelte';
  import { app, saveSetting, reloadProducts, reloadEvents, setCurrentEvent } from '../lib/state.svelte.js';
  import { isTauri, resetDevDb } from '../lib/db/index.js';
  import { loadDemoData, hasDemoData, removeDemoData } from '../lib/demo.js';
  import { play } from '../lib/sound.js';
  import pkg from '../../package.json';
  import logo from '../../app-icon.svg';

  const ACCENTS = [
    ['petrol', 'Petrolio', '#17625F'],
    ['navy', 'Blu inchiostro', '#1F4E79'],
    ['plum', 'Prugna', '#6B3A5E'],
    ['wine', 'Bordeaux', '#7C2D3B']
  ];

  let demoMsg = $state('');
  let busy = $state(false);
  let hasDemo = $state(false);
  let confirmRemove = $state(false);
  hasDemoData().then((v) => (hasDemo = v));

  async function demo() {
    if (busy) return;
    busy = true;
    const id = await loadDemoData();
    await reloadProducts();
    await reloadEvents();
    await setCurrentEvent(id);
    demoMsg = 'Dati di prova caricati: 8 prodotti e l\'evento "Fiera di prova".';
    hasDemo = true;
    busy = false;
  }
  async function removeDemo() {
    busy = true;
    confirmRemove = false;
    const r = await removeDemoData();
    await reloadProducts();
    await reloadEvents();
    if (!app.events.some((e) => e.id === app.currentEventId)) await setCurrentEvent(null);
    demoMsg = `Dati di prova rimossi: ${r.events === 1 ? '1 evento' : r.events + ' eventi'} e ${r.products} prodotti.` + (r.kept ? ` ${r.kept} prodotti di prova sono usati in altri eventi e sono stati tenuti.` : '');
    hasDemo = r.kept > 0;
    busy = false;
  }
</script>

<div class="admin">
  <AdminHeader />
  <div class="abody">
    <div class="set-page">
      <section class="panel set-head">
        <img src={logo} alt="" width="56" height="56" />
        <div class="set-head-txt"><strong>Bip</strong><span>Versione {pkg.version}</span></div>
        <div class="set-head-till">
          <strong>{app.till.name}</strong>
          <span>{app.till.role === 'principal' ? 'Cassa principale' : 'Cassa secondaria'}, codice {app.till.id}</span>
        </div>
        <button type="button" class="outline sm" onclick={() => (app.screen = 'casse')}><Icon name="point_of_sale" /><span>Casse e rete</span></button>
      </section>

      <div class="set-grid">
        <div class="cs-stack">
          <p class="set-sect">Attività, aspetto e dati</p>
          <ShopSettings />
      <div class="panel">
        <h3>Colore</h3>
        <div class="chips" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          {#each ACCENTS as [key, label, color] (key)}
            <button type="button" class:on={app.accent === key} onclick={() => saveSetting('accent', key)}>
              <i class="sw" style="background:{color}"></i>{label}
            </button>
          {/each}
        </div>
      </div>
      <div class="panel">
        <button type="button" class="switch inl" class:on={app.sound} role="switch" aria-checked={app.sound} onclick={() => { saveSetting('sound', !app.sound); play('ok'); }}>
          <span>Suoni della cassa</span><span class="knob"></span>
        </button>
        <p class="hint" style="margin-top:0">Un bip per ogni lettura riuscita e un suono diverso per avvisi ed errori.</p>
      </div>
      {#if app.till.role === 'principal'}
      <div class="panel">
        <h3>Dati di prova</h3>
        <p class="hint" style="margin:0 0 12px">Aggiunge 8 prodotti e un evento aperto per provare la cassa. Potrai chiudere l'evento e modificare i prodotti in qualsiasi momento.</p>
        <div class="row-inline">
          <button type="button" class="outline" disabled={busy} onclick={demo}><Icon name="science" /><span>Carica dati di prova</span></button>
          {#if hasDemo}
            <button type="button" class="outline" disabled={busy} onclick={() => (confirmRemove = true)}><Icon name="delete" /><span>Rimuovi i dati di prova</span></button>
          {/if}
          {#if !isTauri()}
            <button type="button" class="outline" onclick={() => { resetDevDb(); location.reload(); }}><Icon name="restart_alt" /><span>Svuota il database del browser</span></button>
          {/if}
        </div>
        {#if confirmRemove}
          <div class="confirmbox" style="margin-top:12px" use:reveal>
            <p>Verranno eliminati gli eventi di prova, con tutte le vendite registrate su di essi, e i prodotti di prova.</p>
            <button type="button" onclick={() => (confirmRemove = false)}>Annulla</button>
            <button type="button" class="go" onclick={removeDemo}>Rimuovi</button>
          </div>
        {/if}
        {#if demoMsg}<p class="okmsg" use:reveal>{demoMsg}</p>{/if}
      </div>
      {/if}
          <ResetPanel />
        </div>
        <div class="cs-stack">
          <p class="set-sect">Servizi collegati</p>
      {#if app.till.role === 'principal'}
        <MailSettings />
      {/if}
      {#if app.till.role === 'principal'}
        <FicSettings />
      {:else}
        <div class="panel"><h3>Fatture in Cloud</h3><p class="hint" style="margin:0">Il collegamento a Fatture in Cloud si usa dalla cassa principale. I prodotti importati arrivano qui con la sincronizzazione.</p></div>
      {/if}
        </div>
      </div>
    </div>
  </div>
</div>
