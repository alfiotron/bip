// Sul touchscreen, un trascinamento per scorrere la pagina a volte viene preso per un tocco:
// si apre un dettaglio invece di scorrere. Qui si scarta il "clic" che arriva alla fine di un
// gesto in cui il dito si è spostato o la pagina è scorsa. Il mouse e la tastiera non sono toccati.

const MOVE = 12; // pixel oltre i quali il gesto è un trascinamento

export function installTapGuard() {
  let down = null;
  document.addEventListener('pointerdown', (e) => {
    down = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, moved: false };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE) down.moved = true;
  }, true);
  // Qualsiasi scorrimento durante il gesto (anche di un riquadro interno) lo rende un trascinamento
  document.addEventListener('scroll', () => {
    if (down) down.moved = true;
  }, true);
  document.addEventListener('click', (e) => {
    if (down && down.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    down = null;
  }, true);
}
