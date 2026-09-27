<script>
  import Icon from '../../components/Icon.svelte';
  import { app, saveShop } from '../../lib/state.svelte.js';
  import { fileToLogo } from '../../lib/image.js';
  import { reveal } from '../../lib/reveal.js';

  let name = $state(app.shop.name);
  let nameMsg = $state('');
  let err = $state('');
  let busy = $state(false);
  let input;

  async function pick(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    err = '';
    busy = true;
    try {
      await saveShop('logo', await fileToLogo(file));
    } catch (x) {
      err = x.message;
    }
    busy = false;
  }
  async function saveName() {
    await saveShop('name', name.trim());
    nameMsg = 'Nome salvato.';
  }
</script>

<div class="panel">
  <h3>La tua attività</h3>
  <p class="hint" style="margin:0 0 14px">Nome e logo compaiono in cassa e sui riepiloghi dei DDT. Valgono per tutte le casse: le altre li ricevono con la sincronizzazione.</p>

  <label class="flabel" style="margin-top:0" for="shopname">Nome dell'attività</label>
  <div class="newev">
    <input id="shopname" class="field" placeholder="Edizioni Aurora srl" bind:value={name} oninput={() => (nameMsg = '')} />
    <button type="button" class="solid" onclick={saveName}>Salva</button>
  </div>
  {#if nameMsg}<p class="hint">{nameMsg}</p>{/if}

  <span class="flabel">Logo</span>
  <div class="logobox">
    <div class="logoprev" class:empty={!app.shop.logo}>
      {#if app.shop.logo}<img src={app.shop.logo} alt="Logo attuale" />{:else}<Icon name="image" size={36} />{/if}
    </div>
    <div class="logoacts">
      <input bind:this={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onchange={pick} hidden />
      <button type="button" class="outline" disabled={busy} onclick={() => input.click()}>
        <Icon name="upload" /><span>{busy ? 'Carico…' : app.shop.logo ? 'Cambia logo' : 'Carica logo'}</span>
      </button>
      {#if app.shop.logo}
        <button type="button" class="linkb danger" onclick={() => saveShop('logo', '')}><Icon name="delete" size={18} />Rimuovi logo</button>
      {/if}
      <p class="hint" style="margin:0">PNG con sfondo trasparente, JPG o SVG. L'immagine viene ridimensionata in automatico.</p>
    </div>
  </div>
  {#if err}<p class="kerr" use:reveal>{err}</p>{/if}

  {#if app.shop.logo}
    <button type="button" class="switch" class:on={app.shop.logoTop} role="switch" aria-checked={app.shop.logoTop} onclick={() => saveShop('logoTop', !app.shop.logoTop)}>
      <span>Mostra il logo in alto nella cassa</span><span class="knob"></span>
    </button>
    <button type="button" class="switch" class:on={app.shop.logoIdle} role="switch" aria-checked={app.shop.logoIdle} onclick={() => saveShop('logoIdle', !app.shop.logoIdle)}>
      <span>Mostra il logo in grande quando il carrello è vuoto</span><span class="knob"></span>
    </button>
    <p class="hint" style="margin-top:0">Con il carrello vuoto lo schermo diventa una piccola vetrina del tuo marchio, visibile anche ai clienti.</p>
  {/if}
</div>
