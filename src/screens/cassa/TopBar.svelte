<script>
  import Icon from '../../components/Icon.svelte';
  import { app, currentEvent, setCurrentEvent } from '../../lib/state.svelte.js';
  import { ui } from '../../lib/ui.svelte.js';
  import { eur } from '../../lib/money.js';
  import { ADMIN_SCREENS } from '../../lib/nav.js';

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
  function onDocDown(e) {
    if (ui.eventMenuOpen && !e.target.closest('.evwrap')) ui.eventMenuOpen = false;
    if (ui.navOpen && !e.target.closest('.navwrap')) ui.navOpen = false;
  }
</script>

<svelte:document onpointerdown={onDocDown} />

{#if app.shop.logo && app.shop.logoTop}
  <img class="toplogo" src={app.shop.logo} alt={app.shop.name || 'Logo'} />
{/if}

<div class="evwrap">
  <button type="button" class="event" aria-expanded={ui.eventMenuOpen} onclick={() => { ui.eventMenuOpen = !ui.eventMenuOpen; ui.navOpen = false; }}>
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
  {#if ui.eventMenuOpen}
    <div class="menu evmenu">
      <p class="evhint">
        {openEvents.length ? "Vendite e omaggi vengono registrati sull'evento selezionato." : 'Non ci sono eventi aperti. Creane uno dalla scheda Eventi.'}
      </p>
      {#each openEvents as e (e.id)}
        <button type="button" class="evitem" class:sel={e.id === app.currentEventId} onclick={() => choose(e.id)}>
          <span class="evname">{e.name}</span>
          {#if e.id === app.currentEventId}<Icon name="check" />{/if}
        </button>
      {/each}
      <button type="button" class="navitem sep" onclick={() => { ui.eventMenuOpen = false; app.screen = 'eventi'; }}>
        <Icon name="tune" /><span>Gestisci eventi</span>
      </button>
    </div>
  {/if}
</div>

<div class="status {st[0]}" role="status"><Icon name={st[1]} /><span class="num">{ui.status.text}</span></div>

<div class="navwrap">
  <button type="button" class="icon-btn" aria-label="Menu" aria-expanded={ui.navOpen} onclick={() => { ui.navOpen = !ui.navOpen; ui.eventMenuOpen = false; }}>
    <Icon name="menu" />
  </button>
  {#if ui.navOpen}
    <div class="menu navmenu">
      {#each ADMIN_SCREENS as s (s.key)}
        <button type="button" class="navitem" onclick={() => go(s.key)}><Icon name={s.icon} /><span>{s.label}</span></button>
      {/each}
    </div>
  {/if}
</div>
