<script>
  import TopBar from './cassa/TopBar.svelte';
  import CartView from './cassa/CartView.svelte';
  import SearchView from './cassa/SearchView.svelte';
  import ManualView from './cassa/ManualView.svelte';
  import TillCart from './cassa/TillCart.svelte';
  import TillDiscount from './cassa/TillDiscount.svelte';
  import TillPay from './cassa/TillPay.svelte';
  import Toast from '../components/Toast.svelte';
  import { pos } from '../lib/pos.svelte.js';
</script>

<div class="app">
  <section class="main">
    <header class="top"><TopBar /></header>
    <div class="body">
      {#if pos.view === 'search'}
        <SearchView />
      {:else if pos.view === 'manual'}
        <ManualView />
      {:else}
        <CartView />
      {/if}
    </div>
  </section>
  <aside class="till" aria-label="Pagamento">
    {#if pos.panel === 'pay' && pos.pay}
      <TillPay />
    {:else if pos.panel === 'discount'}
      <TillDiscount />
    {:else}
      <TillCart />
    {/if}
  </aside>
  <Toast />
</div>
