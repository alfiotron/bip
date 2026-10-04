<script>
  import TouchSelect from '../components/TouchSelect.svelte';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';
  import BarChart from '../components/BarChart.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import SalesList from './statistiche/SalesList.svelte';
  import ReportMail from './statistiche/ReportMail.svelte';
  import { app, currentEvent, productById, brandName } from '../lib/state.svelte.js';
  import { eventStatistics, delta, dayLabel, dayLabelLong, pct } from '../lib/stats.js';
  import { eventSummary } from '../lib/stock.js';
  import { exportEvent } from '../lib/export.js';
  import { showToast } from '../lib/ui.svelte.js';
  import { eur } from '../lib/money.js';
  import { codeLabel } from '../lib/codes.js';

  let eventId = $state(currentEvent()?.id || app.events[0]?.id || null);
  let compareId = $state('');
  let day = $state(null); // null = tutti i giorni
  let tab = $state('sum');
  let a = $state(null);
  let b = $state(null);
  let stock = $state({});
  let query = $state('');
  let sort = $state('q');
  let picked = $state(null); // prodotto di cui mostrare l'andamento
  let exporting = $state(false);
  let mailing = $state(false);
  let brand = $state(''); // filtro dell'elenco prodotti: '' tutti, 'none' senza marchio, oppure l'id

  const events = $derived([...app.events].sort((x, y) => y.is_open - x.is_open));
  const ev = $derived(app.events.find((e) => e.id === eventId) || null);
  const cmp = $derived(!day && app.events.find((e) => e.id === compareId) || null);

  $effect(() => {
    app.version;
    const id = eventId;
    const d = day;
    if (!id) return;
    eventStatistics(id, d).then((s) => (a = s));
    eventSummary(id).then((s) => (stock = s));
  });
  $effect(() => {
    app.version;
    const id = compareId;
    if (id) eventStatistics(id).then((s) => (b = s));
    else b = null;
  });

  function changeEvent() {
    day = null;
    picked = null;
    if (compareId === eventId) compareId = '';
  }

  const tillName = (id) => (id === app.till.id ? app.till.name : 'Cassa ' + id);
  const short = (c) => '€ ' + Math.round(c / 100);

  // Incasso per giorno, con il confronto affiancato giorno per giorno. Toccando una barra si filtra quel giorno.
  const incomeBars = $derived.by(() => {
    if (!a) return [];
    const n = Math.max(a.byDay.length, cmp && b ? b.byDay.length : 0);
    return Array.from({ length: n }, (_, i) => ({
      key: a.byDay[i]?.day ?? null,
      label: a.byDay[i] ? dayLabel(a.byDay[i].day) : `${i + 1}° giorno`,
      a: a.byDay[i]?.income || 0,
      b: cmp && b ? b.byDay[i]?.income || 0 : 0
    }));
  });

  const top = $derived(a ? [...a.products].filter((p) => p.sold > 0).sort((x, y) => y.sold - x.sold || y.gifts - x.gifts).slice(0, 8) : []);

  // Elenco completo: prodotti venduti, in omaggio, portati o consegnati con DDT, più le voci libere
  const allRows = $derived.by(() => {
    if (!a) return [];
    const m = new Map(a.products.map((p) => [p.key, { ...p }]));
    if (!day) {
      for (const pid of Object.keys(stock)) {
        const s = stock[pid];
        if (!m.has(pid) && (s.loaded || s.ddtOut)) {
          const p = productById(pid);
          m.set(pid, { key: pid, product_id: pid, brand: p?.brand_id || null, name: p?.name || 'Prodotto eliminato', code: p?.code || '', unit_cents: p?.price_cents || 0, sold: 0, gifts: 0, days: {} });
        }
      }
    }
    return [...m.values()]
      .filter((r) => !day || r.sold || r.gifts)
      .map((r) => {
        const s = r.product_id ? stock[r.product_id] : null;
        const p = r.product_id ? productById(r.product_id) : null;
        return { ...r, description: p?.description || '', loaded: s ? s.loaded : null, ddt: s ? s.ddtOut - s.ddtBack : null, left: s && s.loaded ? s.left : null, alert: p?.alert_below ?? 5 };
      });
  });
  const rows = $derived.by(() => {
    const t = query.trim().toLowerCase();
    const by = { n: (x, y) => x.name.localeCompare(y.name, 'it'), q: (x, y) => y.sold - x.sold || y.gifts - x.gifts, r: (x, y) => (x.left ?? 1e9) - (y.left ?? 1e9) };
    return allRows
      .filter((r) => (brand === 'none' ? !r.brand : !brand || r.brand === brand))
      .filter((r) => !t || `${r.name} ${r.description} ${r.code}`.toLowerCase().includes(t))
      .sort(by[sort]);
  });
  const sumOf = (f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const pick = $derived(picked ? allRows.find((r) => r.key === picked) || null : null);
  const pickBars = $derived(pick && a ? a.days.map((d) => ({ key: d, label: dayLabel(d), a: pick.days[d]?.sold || 0, b: pick.days[d]?.gifts || 0 })) : []);
  const pickHasGifts = $derived(pickBars.some((x) => x.b));

  function openProduct(r) {
    picked = picked === r.key ? null : r.key;
    if (picked) document.querySelector('.abody')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function doExport() {
    if (exporting) return;
    exporting = true;
    try {
      const path = await exportEvent(ev, app.products, tillName, brandName, app.brands.length > 0);
      if (path) showToast('ok', 'File Excel salvato', { detail: path, sound: null });
    } catch (e) {
      showToast('err', 'Esportazione non riuscita', { detail: String(e?.message || e) });
    }
    exporting = false;
  }
</script>

<div class="admin">
  <AdminHeader>
    {#snippet actions()}
      {#if ev}
        {#if app.till.role === 'principal'}
          <button type="button" class="outline sm" onclick={() => (mailing = !mailing)}><Icon name="send" /><span>Invia<span class="long">{" "}report</span></span></button>
        {/if}
        <button type="button" class="outline sm" disabled={exporting} onclick={doExport}><Icon name="download" /><span>Esporta<span class="long">{" "}in Excel</span></span></button>
      {/if}
    {/snippet}
  </AdminHeader>
  <div class="abody">
    {#if !ev}
      <div class="empty" style="min-height:320px"><Icon name="bar_chart" /><h2>Nessun evento</h2><p>Le statistiche compariranno qui dopo le prime vendite.</p></div>
    {:else}
      <div class="stoolbar">
        <div class="seg tabs3" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'sum'} class:on={tab === 'sum'} onclick={() => (tab = 'sum')}>Riepilogo</button>
          <button type="button" role="tab" aria-selected={tab === 'prod'} class:on={tab === 'prod'} onclick={() => (tab = 'prod')}>Prodotti</button>
          <button type="button" role="tab" aria-selected={tab === 'sales'} class:on={tab === 'sales'} onclick={() => (tab = 'sales')}>Vendite</button>
        </div>
        <div class="aright">
          <TouchSelect bind:value={eventId} label="Evento" onchange={changeEvent}
            options={events.map((e) => ({ value: e.id, label: e.name, group: e.is_open ? 'Aperti' : 'Chiusi' }))} />
          {#if tab === 'prod' && app.brands.length}
            <TouchSelect bind:value={brand} label="Marchio" options={[{ value: '', label: 'Tutti i marchi' }, ...app.brands.map((b) => ({ value: b.id, label: b.name })), { value: 'none', label: 'Senza marchio' }]} />
          {/if}
          {#if tab === 'sum' && !day}
            <TouchSelect bind:value={compareId} label="Confronta con"
              options={[{ value: '', label: 'Nessun confronto' }, ...events.filter((e) => e.id !== eventId).map((e) => ({ value: e.id, label: e.name, group: e.is_open ? 'Aperti' : 'Chiusi' }))]} />
          {/if}
        </div>
      </div>

      {#if mailing && ev}
        <ReportMail event={ev} {day} onclose={() => (mailing = false)} />
      {/if}

      {#if a && a.days.length > 1}
        <div class="daybar" role="group" aria-label="Giorno">
          <button type="button" class:on={!day} onclick={() => (day = null)}>Tutti i giorni</button>
          {#each a.days as d (d)}
            <button type="button" class:on={day === d} onclick={() => (day = d)}>{dayLabel(d)}</button>
          {/each}
        </div>
      {/if}

      {#if a && tab === 'sum'}
        {#snippet kpi(label, va, vb, fmt)}
          {@const dd = cmp && b ? delta(va, vb) : null}
          <div class="panel">
            <span class="tl">{label}</span>
            <div class="kv num">{fmt(va)}</div>
            {#if cmp && b}<div class="kc num">{cmp.name}: {fmt(vb)} {#if dd !== null}<span class={dd >= 0 ? 'up' : 'down'}>{dd >= 0 ? '+' : '−'}{Math.abs(dd)}%</span>{/if}</div>{/if}
          </div>
        {/snippet}
        {#if day}<p class="hint" style="margin:-4px 0 12px">Dati di {dayLabelLong(day)}.</p>{/if}
        <div class="kpis">
          {@render kpi('Incasso', a.income, b?.income, eur)}
          {@render kpi('Vendite', a.count, b?.count, (x) => x)}
          {@render kpi('Pezzi venduti', a.pieces, b?.pieces, (x) => x)}
          {@render kpi('Scontrino medio', a.average, b?.average, eur)}
          <div class="panel">
            <span class="tl">Sconto medio sul prezzo pieno</span>
            <div class="kv num">{pct(a.discountPct)}</div>
            {#if cmp && b}
              {@const pts = Math.round((a.discountPct - b.discountPct) * 1000) / 10}
              <div class="kc num">{cmp.name}: {pct(b.discountPct)} {#if pts}<span class={pts <= 0 ? 'up' : 'down'}>{pts > 0 ? '+' : '−'}{Math.abs(pts).toLocaleString('it-IT')} punti</span>{/if}</div>
            {:else}
              <div class="kc num">{eur(a.income)} incassati su {eur(a.list)} a prezzo pieno</div>
            {/if}
          </div>
        </div>

        {#if !a.count && !a.gifts.count}
          <div class="empty" style="min-height:240px"><Icon name="bar_chart" /><h2>Ancora nessuna vendita</h2><p>Le statistiche di {ev.name} compariranno qui dalla prima vendita registrata.</p></div>
        {:else}
          <div class="grid2">
            <div class="panel">
              <h3>Incasso per giorno</h3>
              {#if cmp && b}<div class="legend"><span><i></i>{ev.name}</span><span><i class="b"></i>{cmp.name}</span></div>{/if}
              <BarChart bars={incomeBars} format={short} showB={!!(cmp && b)} ariaLabel="Incasso per giorno" picked={day} />
            </div>
            <div class="stack">
              <div class="panel">
                <h3>Metodi di pagamento</h3>
                {#each [['card', 'Carta', 'credit_card'], ['cash', 'Contanti', 'payments']] as [k, l, ic] (k)}
                  {@const x = a.methods[k]}
                  {@const sh = a.income ? Math.round((x.total / a.income) * 100) : 0}
                  <div class="mrow">
                    <div class="mtop"><span><Icon name={ic} />{l}</span><strong class="num">{eur(x.total)}</strong></div>
                    <div class="msub num"><span>{x.count} {x.count === 1 ? 'vendita' : 'vendite'}</span><span>{sh}% dell'incasso</span></div>
                    <div class="mbar"><i style="width:{sh}%"></i></div>
                  </div>
                {/each}
              </div>
              {#if Object.keys(a.tills).length > 1}
                <div class="panel">
                  <h3>Per cassa</h3>
                  {#each Object.entries(a.tills) as [id, x] (id)}
                    {@const sh = a.income ? Math.round((x.total / a.income) * 100) : 0}
                    <div class="mrow">
                      <div class="mtop"><span><Icon name="point_of_sale" />{tillName(id)}</span><strong class="num">{eur(x.total)}</strong></div>
                      <div class="msub num"><span>{x.count} {x.count === 1 ? 'vendita' : 'vendite'}</span><span>{sh}%</span></div>
                      <div class="mbar"><i style="width:{sh}%"></i></div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          {#if app.brands.length && a.brands.length}
            <div class="panel" style="margin-top:12px">
              <h3>Per marchio</h3>
              <div class="tscroll">
                <table class="tbl" style="min-width:640px">
                  <thead><tr><th>Marchio</th><th class="r">Venduti</th><th class="r">Omaggi</th><th class="r">A prezzo pieno</th><th class="r">Incassato</th><th class="r">Sconto</th></tr></thead>
                  <tbody>
                    {#each a.brands as x (x.brand || '')}
                      <tr class="clickrow" onclick={() => { brand = x.brand || 'none'; tab = 'prod'; }}>
                        <td>{brandName(x.brand)}</td><td class="r num">{x.sold}</td><td class="r num">{x.gifts || '—'}</td>
                        <td class="r num">{eur(x.list)}</td><td class="r num"><strong>{eur(x.income)}</strong></td><td class="r num">{x.list ? pct(x.discountPct) : '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                  <tfoot><tr><td>Totale</td><td class="r num">{a.brands.reduce((t, x) => t + x.sold, 0)}</td><td class="r num">{a.brands.reduce((t, x) => t + x.gifts, 0)}</td>
                    <td class="r num">{eur(a.brands.reduce((t, x) => t + x.list, 0))}</td><td class="r num">{eur(a.brands.reduce((t, x) => t + x.income, 0))}</td><td class="r num">{pct(a.discountPct)}</td></tr></tfoot>
                </table>
              </div>
              <p class="hint" style="margin:10px 0 0">"Incassato" tiene conto di sconti e arrotondamenti, ripartiti tra i prodotti di ogni vendita in proporzione al loro prezzo. Tocca un marchio per vederne i prodotti.</p>
            </div>
          {/if}

          <div class="grid2">
            <div class="panel">
              <h3>Più venduti</h3>
              <table class="tbl">
                <thead><tr><th>Prodotto</th><th class="r">Venduti</th><th class="r">Omaggi</th></tr></thead>
                <tbody>
                  {#each top as p (p.key)}
                    <tr><td>{p.name}{#if !p.product_id}<span class="tag off">Voce libera</span>{/if}</td><td class="r num">{p.sold}</td><td class="r num">{p.gifts || '—'}</td></tr>
                  {/each}
                </tbody>
              </table>
              <button type="button" class="linkb" style="margin-top:10px" onclick={() => (tab = 'prod')}>Vedi tutti i prodotti</button>
            </div>
            <div class="stack">
              <div class="panel">
                <h3>Sconti, omaggi e DDT</h3>
                <div class="kvrow"><span>Copie vendute a prezzo pieno</span><span class="num">{eur(a.list)}</span></div>
                <div class="kvrow"><span>Incassato</span><span class="num">{eur(a.income)}</span></div>
                <div class="kvrow"><span>Differenza<small>sconti {eur(a.discounts)}, arrotondamenti {eur(a.rounding)}</small></span><span class="num"><strong>{eur(a.list - a.income)}, {pct(a.discountPct)}</strong></span></div>
                <div class="kvrow"><span>Omaggi</span><span class="num">{a.gifts.count} ({a.gifts.pieces} {a.gifts.pieces === 1 ? 'pezzo' : 'pezzi'})</span></div>
                <div class="kvrow"><span>Valore di listino degli omaggi</span><span class="num">{eur(a.gifts.value)}</span></div>
                {#if !day && a.ddt.out}<div class="kvrow"><span>Consegnati a negozi con DDT</span><span class="num">{a.ddt.out} pezzi{a.ddt.back ? `, ${a.ddt.back} rientrati` : ''}</span></div>{/if}
              </div>
              <div class="panel">
                <h3>IVA</h3>
                <table class="tbl">
                  <thead><tr><th>Aliquota</th><th class="r">Incassato</th><th class="r">Imponibile</th><th class="r">Imposta</th></tr></thead>
                  <tbody>
                    {#each a.vat as v (v.rate)}
                      <tr><td>{v.rate ? v.rate + '%' : 'Assolta (art. 74)'}</td><td class="r num">{eur(v.gross)}</td><td class="r num">{v.rate ? eur(v.gross - v.tax) : '—'}</td><td class="r num">{v.rate ? eur(v.tax) : '—'}</td></tr>
                    {/each}
                  </tbody>
                  <tfoot><tr><td>Totale</td><td class="r num">{eur(a.vat.reduce((s, v) => s + v.gross, 0))}</td><td></td><td class="r num">{eur(a.vat.reduce((s, v) => s + v.tax, 0))}</td></tr></tfoot>
                </table>
              </div>
            </div>
          </div>
        {/if}
      {:else if a && tab === 'sales'}
        <SalesList sales={a.allSales} {tillName} {dayLabel} eventId={ev.id} />
      {:else if a}
        {#if pick}
          <div class="panel pickpanel">
            <div class="row-inline" style="justify-content:space-between;align-items:flex-start">
              <div class="ihead"><Cover item={pick.product_id ? { id: pick.product_id, name: pick.name } : { free: true }} />
                <div style="min-width:0"><span class="rt">{pick.name}</span><span class="ra num">{pick.code ? codeLabel(pick.code) : pick.product_id ? 'Senza codice' : 'Voce libera'}</span></div></div>
              <button type="button" class="icon-btn" aria-label="Chiudi" onclick={() => (picked = null)}><Icon name="close" /></button>
            </div>
            <div class="pickstats num">
              <div><span class="tl">Venduti{day ? ' nel giorno' : ''}</span><strong>{pick.sold}</strong></div>
              <div><span class="tl">Omaggi</span><strong>{pick.gifts}</strong></div>
              {#if pick.loaded !== null && pick.loaded}<div><span class="tl">Portati</span><strong>{pick.loaded}</strong></div>{/if}
              {#if pick.left !== null}<div><span class="tl">Rimasti</span><strong class={pick.left <= 0 ? 'down' : ''}>{pick.left}</strong></div>{/if}
              {#if pick.list}<div><span class="tl">Sconto medio</span><strong>{pct(pick.discountPct)}</strong></div>{/if}
            </div>
            {#if pick.list}
              <p class="hint">{pick.sold} copie a prezzo pieno valgono {eur(pick.list)}; ne sono stati incassati {eur(pick.income)}. Gli sconti fatti su tutto lo scontrino sono ripartiti tra i prodotti in proporzione al prezzo.</p>
            {/if}
            <h3 style="margin:18px 0 6px">Andamento giorno per giorno</h3>
            {#if pickHasGifts}<div class="legend"><span><i></i>Venduti</span><span><i class="b"></i>Omaggi</span></div>{/if}
            <BarChart bars={pickBars} showB={pickHasGifts} ariaLabel="Pezzi venduti per giorno" picked={day} />
          </div>
        {/if}
        <div class="panel">
          <h3>{day ? `Prodotti venduti ${dayLabelLong(day)}` : "Tutti i prodotti dell'evento"}</h3>
          <p class="hint" style="margin:-8px 0 14px">
            {day ? 'Portati, DDT e rimasti si riferiscono a tutto l\'evento e compaiono con "Tutti i giorni".' : 'Vendite, omaggi e voci libere, più i prodotti portati e non venduti. La colonna DDT indica i pezzi consegnati ai negozi al netto dei rientri in fiera.'}
            Tocca un prodotto per vederne l'andamento giorno per giorno.
          </p>
          <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per nome, descrizione o codice" bind:value={query} /></div>
          {#if rows.length}
            <div class="tscroll">
              <table class="tbl sold">
                <thead><tr>
                  <th><button type="button" class="sortb" class:on={sort === 'n'} onclick={() => (sort = 'n')}>Prodotto{#if sort === 'n'}<Icon name="arrow_upward" />{/if}</button></th>
                  <th>Codice</th><th class="r">Prezzo</th>
                  {#if !day}<th class="r">Portati</th>{/if}
                  <th class="r"><button type="button" class="sortb" class:on={sort === 'q'} onclick={() => (sort = 'q')}>Venduti{#if sort === 'q'}<Icon name="arrow_downward" />{/if}</button></th>
                  <th class="r">Omaggi</th>
                  <th class="r">Sconto</th>
                  {#if !day}
                    <th class="r">DDT</th>
                    <th class="r"><button type="button" class="sortb" class:on={sort === 'r'} onclick={() => (sort = 'r')}>Rimasti{#if sort === 'r'}<Icon name="arrow_upward" />{/if}</button></th>
                  {/if}
                </tr></thead>
                <tbody>
                  {#each rows as r (r.key)}
                    <tr class="clickrow" class:picked={picked === r.key} onclick={() => openProduct(r)}>
                      <td><div class="pcell"><Cover item={r.product_id ? { id: r.product_id, name: r.name } : { free: true }} /><div style="min-width:0"><span>{r.name}</span><small>{[app.brands.length && r.brand ? brandName(r.brand) : '', r.description || (!r.product_id ? 'Voce libera' : '')].filter(Boolean).join(', ')}</small></div></div></td>
                      <td class="num" style="color:var(--ink-2)">{r.code ? codeLabel(r.code) : '—'}</td>
                      <td class="r num">{eur(r.unit_cents)}</td>
                      {#if !day}<td class="r num">{r.loaded || '—'}</td>{/if}
                      <td class="r num"><strong>{r.sold}</strong></td>
                      <td class="r num">{r.gifts || '—'}</td>
                      <td class="r num">{r.list ? pct(r.discountPct) : '—'}</td>
                      {#if !day}
                        <td class="r num">{r.ddt || '—'}</td>
                        <td class="r num">{#if r.left === null}—{:else}<span class="pstock {r.left <= 0 ? 'bad' : r.left <= r.alert ? 'warn' : ''}">{r.left}</span>{/if}</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
                <tfoot><tr>
                  <td>{rows.length === allRows.length ? `${rows.length} prodotti` : `${rows.length} di ${allRows.length} prodotti`}</td><td></td><td></td>
                  {#if !day}<td class="r num">{sumOf((r) => r.loaded)}</td>{/if}
                  <td class="r num">{sumOf((r) => r.sold)}</td><td class="r num">{sumOf((r) => r.gifts)}</td>
                  <td class="r num">{sumOf((r) => r.list) ? pct(1 - sumOf((r) => r.income) / sumOf((r) => r.list)) : '—'}</td>
                  {#if !day}<td class="r num">{sumOf((r) => r.ddt)}</td><td class="r num">{sumOf((r) => r.left)}</td>{/if}
                </tr></tfoot>
              </table>
            </div>
          {:else}
            <p class="hint">{query ? 'Nessun prodotto corrisponde alla ricerca.' : 'Nessun prodotto per questo evento.'}</p>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
