import { isTauri } from './db/index.js';

// Salva un file scelto dall'utente. Nell'app si apre la finestra "Salva con nome" del sistema;
// nel browser di sviluppo il file viene scaricato.
export async function saveFile(filename, bytes, mime, filterName, extensions) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await save({ defaultPath: filename, filters: [{ name: filterName, extensions }] });
    if (!path) return null; // l'utente ha annullato
    await invoke('write_file', { path, contents: Array.from(bytes) });
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
