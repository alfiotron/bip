<script>
  import Icon from '../../components/Icon.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import pkg from '../../../package.json';
  import { app, currentEvent, setCurrentEvent } from '../../lib/state.svelte.js';
  import { ui } from '../../lib/ui.svelte.js';
  import { eur } from '../../lib/money.js';
  import { ADMIN_SCREENS } from '../../lib/nav.js';
  import { hub } from '../../lib/sync/hub.svelte.js';
  import { link } from '../../lib/sync/link.svelte.js';

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 5000);
    return () => clearInterval(t);
  });
  // Casse secondarie che si sono fatte sentire negli ultimi 20 secondi
  const connected = $derived(Object.values(hub.seen).filter((s) => now - new Date(s.at).getTime() < 20000).length);
  const net = $derived.by(() => {
    if (app.till.role === 'principal') {
      if (!hub.running) return { on: false, icon: 'cloud_off', text: 'rete non attiva' };
      return { on: connected > 0, icon: 'hub', text: connected ? (connected === 1 ? '1 cassa collegata' : connected + ' casse collegate') : '' };
    }
    if (link.state === 'revoked') return { on: false, icon: 'link_off', text: 'scollegata' };
    if (link.state === 'ok') return { on: true, icon: 'sync', text: link.pending ? `${link.pending} da inviare` : 'in rete' };
    return { on: false, icon: 'cloud_off', text: link.pending ? `${link.pending} da inviare` : 'non collegata' };
  });

  const ev = $derived(currentEvent());
  const openEvents = $derived(app.events.filter((e) => e.is_open));
  const STATUS = { idle: ['idle', 'barcode_scanner'], ok: ['ok', 'check_circle'], warn: ['err', 'info'], err: ['err', 'error'] };
  const st = $derived(STATUS[ui.status.kind] || STATUS.idle);

  async function choose(id) {
    ui.eventMenuOpen = false;
    await setCurrentEvent(id);
  }
  function go(screen) {
    ui.navOpen = false;
    app.screen = screen;
  }
  const closedCount = $derived(app.events.length - openEvents.length);
</script>

{#if app.shop.logo && app.shop.logoTop}
  <img class="toplogo" src={app.shop.logo} alt={app.shop.name || 'Logo'} />
{/if}

<div class="evwrap">
  <button type="button" class="event" aria-expanded={ui.eventMenuOpen} onclick={() => { ui.eventMenuOpen = true; ui.navOpen = false; }}>
    <Icon name="event" />
    <span class="evtxt">
      {#if ev}
        <span class="evname">{ev.name}</span>
        <span class="evstats num">
          <span>{app.stats.sales} {app.stats.sales === 1 ? 'vendita' : 'vendite'}</span>
          <span>{app.stats.gifts} {app.stats.gifts === 1 ? 'omaggio' : 'omaggi'}</span>
          <span>{eur(app.stats.total)}</span>
        </span>
      {:else}
        <span class="evname none">Scegli un evento</span>
      {/if}
    </span>
    <Icon name="expand_more" />
  </button>
</div>

<button type="button" class="netpill" class:on={net.on} aria-label="Stato della rete" onclick={() => (app.screen = 'casse')}>
  <Icon name={net.icon} /><span>{app.till.name}{net.text ? ', ' + net.text : ''}</span>
</button>

<div class="status {st[0]}" role="status"><Icon name={st[1]} /><span class="num">{ui.status.text}</span></div>

<div class="navwrap">
  <button type="button" class="icon-btn menubtn" aria-label="Menu" aria-expanded={ui.navOpen} onclick={() => { ui.navOpen = true; ui.eventMenuOpen = false; }}>
    <Icon name="apps" /><span>Menu</span>
  </button>
</div>

{#if ui.navOpen}
  <Dialog label="Menu" onclose={() => (ui.navOpen = false)} sheet>
    <div class="tsheet-head">
      <h2>Menu</h2>
      <button type="button" class="icon-btn" aria-label="Chiudi" onclick={() => (ui.navOpen = false)}><Icon name="close" /></button>
    </div>
    <div class="navmenu launcher">
      {#each ADMIN_SCREENS as s (s.key)}
        <button type="button" class="tile" onclick={() => go(s.key)}>
          <Icon name={s.icon} size={30} />
          <strong>{s.label}</strong>
          <small>{s.desc}</small>
        </button>
      {/each}
    </div>
    <p class="hint launcher-foot">{app.till.name}{app.shop.name ? ', ' + app.shop.name : ''}. Bip versione {pkg.version}</p>
  </Dialog>
{/if}

{#if ui.eventMenuOpen}
  <Dialog label="Evento" onclose={() => (ui.eventMenuOpen = false)} sheet>
    <div class="tsheet-head">
      <h2>Evento in cassa</h2>
      <button type="button" class="icon-btn" aria-label="Chiudi" onclick={() => (ui.eventMenuOpen = false)}><Icon name="close" /></button>
    </div>
    <p class="hint" style="margin:-4px 0 12px">
      {openEvents.length ? "Vendite e omaggi vengono registrati sull'evento scelto." : 'Non ci sono eventi aperti: creane uno dalla scheda Eventi.'}
    </p>
    <div class="tsheet-list">
      {#each openEvents as e (e.id)}
        <button type="button" class="tsheet-opt evopt" class:on={e.id === app.currentEventId} onclick={() => choose(e.id)}>
          <span>{e.name}</span>
          {#if e.id === app.currentEventId}<Icon name="check" />{/if}
        </button>
      {/each}
    </div>
    <button type="button" class="outline cs-wide" style="margin-top:14px" onclick={() => { ui.eventMenuOpen = false; app.screen = 'eventi'; }}>
      <Icon name="tune" /><span>{openEvents.length ? 'Gestisci eventi' : 'Crea un evento'}{closedCount ? ` (${closedCount} chiusi)` : ''}</span>
    </button>
  </Dialog>
{/if}
