<script>
  // Icona della raccolta Material Symbols (inclusa nell'app, funziona offline).
  let { name, fill = false, size = null } = $props();
</script>

<span class="ms" aria-hidden="true" style:font-size={size ? size + 'px' : null} style:font-variation-settings={fill ? '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24' : null}>{name}</span>
