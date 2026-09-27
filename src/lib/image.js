// Prepara il logo caricato dall'esercente: lo ridimensiona e lo converte in PNG,
// così resta leggero (poche decine di kB) e si può condividere con le altre casse.

const MAX_SIDE = 600;
const MAX_FILE = 15 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Impossibile leggere il file.'));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Il file non sembra un\'immagine valida.'));
    img.src = src;
  });
}

/** Restituisce il logo come immagine PNG in formato data URL. */
export async function fileToLogo(file) {
  if (!file) throw new Error('Nessun file scelto.');
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Scegli un\'immagine PNG, JPG, WebP o SVG.');
  if (file.size > MAX_FILE) throw new Error('L\'immagine è troppo grande: scegli un file sotto i 15 MB.');
  const img = await loadImage(await readAsDataUrl(file));
  let w = img.naturalWidth || 600;
  let h = img.naturalHeight || 600;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
