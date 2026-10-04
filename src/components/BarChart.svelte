<script>
  // Grafico a barre semplice, in SVG. Ogni elemento di `bars` è { label, a, b }:
  // `a` è la serie principale (colore d'accento), `b` quella affiancata (grigia, facoltativa).
  let { bars = [], format = (v) => v, showB = false, ariaLabel = 'Grafico', onpick = null, picked = null } = $props();

  const W = 620, H = 230, top = 26, bot = 190;
  const layout = $derived.by(() => {
    const n = Math.max(bars.length, 1);
    const max = Math.max(1, ...bars.map((x) => x.a || 0), ...(showB ? bars.map((x) => x.b || 0) : []));
    const gw = (W - 20) / n;
    return bars.map((x, i) => {
      const x0 = 10 + i * gw;
      const bw = showB ? Math.min(gw * 0.3, 46) : Math.min(gw * 0.42, 64);
      const ha = ((bot - top) * (x.a || 0)) / max;
      const hb = ((bot - top) * (x.b || 0)) / max;
      return {
        ...x, x0, gw, bw,
        xa: showB ? x0 + gw / 2 - bw - 2 : x0 + (gw - bw) / 2, ya: bot - ha, ha: x.a ? Math.max(ha, 2) : 0,
        xb: x0 + gw / 2 + 2, yb: bot - hb, hb: x.b ? Math.max(hb, 2) : 0, cx: x0 + gw / 2
      };
    });
  });
</script>

<svg viewBox="0 0 {W} {H}" class="chart" role="img" aria-label={ariaLabel}>
  <line x1="10" x2={W - 10} y1={bot} y2={bot} class="axis" />
  {#each layout as r, i (i)}
    {#if onpick}
      <rect x={r.x0} y="0" width={r.gw} height={H} class="hit" class:picked={picked === r.key} role="button" tabindex="0"
        aria-label={r.label} onclick={() => onpick(r.key)} onkeydown={(e) => e.key === 'Enter' && onpick(r.key)} />
    {:else if picked && picked === r.key}
      <rect x={r.x0} y="0" width={r.gw} height={H} class="pickedband" />
    {/if}
    <rect x={r.xa} y={r.ya} width={r.bw} height={r.ha} rx="3" class="ba" />
    {#if r.a}<text x={r.xa + r.bw / 2} y={r.ya - 8} text-anchor="middle" class="bv">{format(r.a)}</text>{/if}
    {#if showB}
      <rect x={r.xb} y={r.yb} width={r.bw} height={r.hb} rx="3" class="bb" />
      {#if r.b}<text x={r.xb + r.bw / 2} y={r.yb - 8} text-anchor="middle" class="bv">{format(r.b)}</text>{/if}
    {/if}
    <text x={r.cx} y={H - 12} text-anchor="middle" class="bl">{r.label}</text>
  {/each}
</svg>
