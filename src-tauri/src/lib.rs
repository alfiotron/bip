// Il "contenitore" dell'app: apre la finestra e registra i plugin.
// Tutta la logica della cassa è scritta in JavaScript, nella cartella src/.

mod sync;

/// Scrive un file nel percorso scelto dall'utente con la finestra "Salva con nome"
/// (per esempio l'esportazione delle statistiche in Excel).
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Impossibile salvare il file: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Database SQLite locale. Lo schema viene creato e aggiornato dal codice JavaScript
        // (src/lib/db/schema.js), così esiste un solo punto in cui è definito.
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Richieste HTTP verso Fatture in Cloud (solo verso gli indirizzi permessi in capabilities/default.json)
        .plugin(tauri_plugin_http::init())
        // Finestre di sistema, come "Salva con nome"
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_file,
            sync::bip_server_start,
            sync::bip_server_stop,
            sync::bip_server_port,
            sync::bip_respond,
            sync::bip_discover,
            sync::bip_local_ips,
            sync::bip_request
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio della cassa");
}
