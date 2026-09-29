<script>
  import Icon from '../../components/Icon.svelte';
  import { mailConfig, saveMailConfig, sendMail, PRESETS, parseRecipients, validEmail, mailReady } from '../../lib/mail.js';
  import { app } from '../../lib/state.svelte.js';
  import { reveal, revealFirstError } from '../../lib/reveal.js';

  // Casella di posta da cui la cassa principale invia il report delle vendite.
  let c = $state(null);
  let open = $state(false);
  let note = $state('');
  let errors = $state({});
  let msg = $state('');
  let busy = $state(false);
  mailConfig().then((x) => { c = x; open = !mailReady(x); });

  function preset(p) {
    c.host = p.host;
    c.port = p.port;
    c.security = p.security;
    note = p.note;
  }
  function check() {
    const e = {};
    if (!c.host.trim()) e.host = 'Scrivi il server di posta in uscita (SMTP).';
    if (!Number(c.port)) e.port = 'Porta non valida.';
    const from = (c.from_email || c.user).trim();
    if (!validEmail(from)) e.from = 'Scrivi l\'indirizzo del mittente (di solito lo stesso dell\'utente).';
    const to = parseRecipients(c.recipients);
    if (!to.length) e.recipients = 'Aggiungi almeno un destinatario.';
    else if (to.some((t) => !validEmail(t))) e.recipients = 'Controlla gli indirizzi: ' + to.filter((t) => !validEmail(t)).join(', ');
    errors = e;
    if (Object.keys(e).length) revealFirstError();
    return !Object.keys(e).length;
  }
  async function save() {
    msg = '';
    if (!check()) return;
    await saveMailConfig(c);
    msg = 'Impostazioni salvate.';
  }
  async function test() {
    msg = '';
    if (!check()) return;
    busy = true;
    await saveMailConfig(c);
    try {
      await sendMail(c, { to: parseRecipients(c.recipients), subject: 'Bip: email di prova', body: `Questa è un'email di prova inviata da ${app.till.name}${app.shop.name ? ' di ' + app.shop.name : ''}.\nSe la ricevi, l'invio dei report funziona.\n\nInviato da Bip` });
      msg = 'Email di prova inviata: controlla la casella dei destinatari.';
    } catch (e) {
      errors = { send: String(e?.message || e) };
    }
    busy = false;
  }
</script>

<div class="panel">
  <div class="row-inline" style="justify-content:space-between">
    <h3 style="margin:0">Invio del report via email</h3>
    {#if c && mailReady(c) && !open}<button type="button" class="outline sm" onclick={() => (open = true)}>Modifica</button>{/if}
  </div>
  {#if c}
    {#if !open}
      <p class="hint">Il report parte da {c.from_email || c.user} verso {parseRecipients(c.recipients).join(', ')}. Serve una connessione a internet al momento dell'invio.</p>
    {:else}
      <p class="hint" style="margin:6px 0 12px">Dalla scheda Statistiche puoi inviare il report delle vendite, con un foglio Excel per marchio. Inserisci i dati della casella di posta da cui partirà l'email.</p>
      <span class="flabel" style="margin-top:0">Impostazioni rapide</span>
      <div class="row-inline">
        {#each PRESETS as p (p.name)}<button type="button" class="outline sm" onclick={() => preset(p)}>{p.name}</button>{/each}
      </div>
      {#if note}<p class="hint">{note}</p>{/if}

      <div class="mailgrid">
        <div><label class="flabel" for="mhost">Server SMTP</label><input id="mhost" class="field" class:bad={errors.host} placeholder="smtps.aruba.it" bind:value={c.host} />{#if errors.host}<p class="kerr">{errors.host}</p>{/if}</div>
        <div><label class="flabel" for="mport">Porta</label><input id="mport" class="field num" class:bad={errors.port} inputmode="numeric" bind:value={c.port} /></div>
      </div>
      <span class="flabel">Sicurezza</span>
      <div class="chips three">
        {#each [['ssl', 'SSL/TLS'], ['starttls', 'STARTTLS'], ['none', 'Nessuna']] as [k, l] (k)}
          <button type="button" class:on={c.security === k} onclick={() => { c.security = k; if (k === 'ssl' && Number(c.port) === 587) c.port = 465; if (k === 'starttls' && Number(c.port) === 465) c.port = 587; }}>{l}</button>
        {/each}
      </div>
      <div class="mailgrid">
        <div><label class="flabel" for="muser">Utente</label><input id="muser" class="field" autocomplete="off" placeholder="cassa@tuodominio.it" bind:value={c.user} /></div>
        <div><label class="flabel" for="mpass">Password</label><input id="mpass" class="field" type="password" autocomplete="off" bind:value={c.password} /></div>
      </div>
      <div class="mailgrid">
        <div><label class="flabel" for="mfromn">Nome del mittente</label><input id="mfromn" class="field" placeholder={app.shop.name || 'Bip'} bind:value={c.from_name} /></div>
        <div><label class="flabel" for="mfrome">Email del mittente</label><input id="mfrome" class="field" class:bad={errors.from} placeholder={c.user || 'cassa@tuodominio.it'} bind:value={c.from_email} />{#if errors.from}<p class="kerr">{errors.from}</p>{/if}</div>
      </div>
      <label class="flabel" for="mto">Destinatari</label>
      <textarea id="mto" class="field area" class:bad={errors.recipients} rows="2" placeholder="amministrazione@tuodominio.it, titolare@tuodominio.it" bind:value={c.recipients}></textarea>
      {#if errors.recipients}<p class="kerr">{errors.recipients}</p>{:else}<p class="hint">Uno o più indirizzi, separati da virgola o uno per riga.</p>{/if}
      <p class="hint">La password resta salvata solo su questa cassa.</p>
      {#if errors.send}<p class="kerr" use:reveal>{errors.send}</p>{/if}
      {#if msg}<p class="okmsg" use:reveal>{msg}</p>{/if}
      <div class="row-inline" style="margin-top:12px">
        <button type="button" class="outline" disabled={busy} onclick={test}><Icon name="send" /><span>{busy ? 'Invio…' : 'Invia un\'email di prova'}</span></button>
        <button type="button" class="solid sm" onclick={save}><Icon name="check" /><span>Salva</span></button>
        {#if mailReady(c)}<button type="button" class="linkb" onclick={() => (open = false)}>Chiudi</button>{/if}
      </div>
    {/if}
  {/if}
</div>
