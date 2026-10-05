<script>
  import Icon from '../../components/Icon.svelte';
  import { app, brandName } from '../../lib/state.svelte.js';
  import { q } from '../../lib/db/index.js';
  import { hub } from '../../lib/sync/hub.svelte.js';
  import { mailConfig, mailReady, sendMail, parseRecipients, validEmail } from '../../lib/mail.js';
  import { buildBrandReport } from '../../lib/brandReport.js';
  import { saveFile } from '../../lib/save.js';
  import { dayLabelLong } from '../../lib/stats.js';
  import { reveal } from '../../lib/reveal.js';

  // Invio del report delle vendite, con un foglio per marchio. Solo dalla cassa principale.
  let { event, day, onclose } = $props();

  let cfg = $state(null);
  // Periodo del report: se è scelto un giorno si propone quel giorno, finché non si sceglie diversamente
  let wholeChoice = $state(null);
  const whole = $derived(wholeChoice ?? !day);
  let to = $state('');
  let extra = $state('');
  let stale = $state([]);
  let err = $state('');
  let msg = $state('');
  let busy = $state(false);

  mailConfig().then((c) => { cfg = c; to = c.recipients; });
  // Casse secondarie che non si sincronizzano da più di 5 minuti: le loro ultime vendite potrebbero mancare
  q(`SELECT id, name FROM tills WHERE role = 'secondary' AND removed = 0`).then((rows) => {
    const now = Date.now();
    stale = rows.map((t) => ({ ...t, at: hub.seen[t.id]?.at })).filter((t) => !t.at || now - new Date(t.at).getTime() > 5 * 60000);
  });

  const period = $derived(whole || !day ? 'tutto l\'evento' : dayLabelLong(day));
  const when = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function report() {
    return buildBrandReport(event, whole ? null : day, app.products, app.brands, brandName);
  }
  async function download() {
    err = '';
    const r = await report();
    await saveFile(r.filename, r.bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
  }
  async function send() {
    err = '';
    msg = '';
    const list = parseRecipients(to);
    if (!list.length) { err = 'Aggiungi almeno un destinatario.'; return; }
    const bad = list.filter((x) => !validEmail(x));
    if (bad.length) { err = 'Controlla gli indirizzi: ' + bad.join(', '); return; }
    busy = true;
    try {
      const r = await report();
      if (r.empty) { err = 'Non ci sono vendite da inviare per questo periodo.'; busy = false; return; }
      const body = (extra.trim() ? extra.trim() + '\n\n' : '') + r.body;
      await sendMail(cfg, { to: list, subject: r.subject, body, attachmentName: r.filename, bytes: r.bytes });
      msg = `Report inviato a ${list.join(', ')}.`;
    } catch (e) {
      err = String(e?.message || e);
    }
    busy = false;
  }
</script>

<div class="panel reportpanel" use:reveal>
  <div class="row-inline" style="justify-content:space-between">
    <h3 style="margin:0">Invia il report via email</h3>
    <button type="button" class="icon-btn" aria-label="Chiudi" onclick={onclose}><Icon name="close" /></button>
  </div>
  {#if cfg && !mailReady(cfg)}
    <p class="hint">Per inviare il report, inserisci prima i dati della casella di posta nella scheda Impostazioni.</p>
    <button type="button" class="solid sm" onclick={() => (app.screen = 'impostazioni')}><Icon name="settings" /><span>Vai alle impostazioni</span></button>
  {:else if cfg}
    <p class="hint" style="margin:4px 0 12px">Un file Excel con un foglio di riepilogo e un foglio per ogni marchio. Serve una connessione a internet.</p>
    {#if day}
      <div class="seg two" role="group" aria-label="Periodo" style="max-width:420px">
        <button type="button" class:on={whole} onclick={() => (wholeChoice = true)}>Tutto l'evento</button>
        <button type="button" class:on={!whole} onclick={() => (wholeChoice = false)}>Solo {dayLabelLong(day)}</button>
      </div>
    {/if}
    {#if stale.length}
      <div class="confirmbox info" style="margin-top:12px">
        <p>{stale.map((t) => `${t.name} ${t.at ? 'non si sincronizza dalle ' + when(t.at) : 'non si è mai sincronizzata'}`).join('; ')}: le sue ultime vendite potrebbero mancare nel report. Se possibile, collegala alla rete prima di inviare.</p>
      </div>
    {/if}
    <label class="flabel" for="rto">Destinatari</label>
    <input id="rto" class="field" bind:value={to} />
    <label class="flabel" for="rextra">Messaggio (facoltativo)</label>
    <textarea id="rextra" class="field area" rows="2" placeholder="Aggiungi una nota in cima all'email" bind:value={extra}></textarea>
    {#if err}<p class="kerr" use:reveal>{err}</p>{/if}
    {#if msg}<p class="okmsg" use:reveal>{msg}</p>{/if}
    <div class="row-inline" style="margin-top:14px">
      <button type="button" class="solid sm" disabled={busy} onclick={send}><Icon name="send" /><span>{busy ? 'Invio…' : `Invia il report di ${period}`}</span></button>
      <button type="button" class="outline sm" onclick={download}><Icon name="download" /><span>Scarica il file</span></button>
    </div>
  {/if}
</div>
