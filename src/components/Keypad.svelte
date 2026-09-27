<script>
  import Icon from './Icon.svelte';
  let { keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'], onkey } = $props();
  const label = (k) => (k === '⌫' ? 'Cancella una cifra' : k === 'C' ? 'Cancella tutto' : k);
</script>

<div class="kp">
  {#each keys as k (k)}
    <button type="button" aria-label={label(k)} onclick={() => onkey(k)}>
      {#if k === '⌫'}<Icon name="backspace" />{:else}{k}{/if}
    </button>
  {/each}
</div>
