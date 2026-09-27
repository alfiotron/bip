// Porta in vista un elemento appena compare (per esempio una richiesta di conferma
// che si apre in fondo a un pannello lungo), così non serve scorrere a mano.
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export function reveal(node) {
  requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest', behavior: smooth() }));
}

/** Dopo una validazione non riuscita: porta in vista il primo campo con un errore. */
export function revealFirstError(container = document) {
  requestAnimationFrame(() => {
    const el = container.querySelector('.bad, .kerr');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: smooth() });
    if (el.matches('input')) el.focus({ preventScroll: true });
  });
}
