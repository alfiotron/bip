// Il "contenitore" dell'app: apre la finestra e registra i plugin.
// Tutta la logica della cassa è scritta in JavaScript, nella cartella src/.

mod mail;
mod sync;

use tauri::Manager;

/// Identificativo usato dalle prime versioni: i dati stavano in una cartella con questo nome.
const OLD_IDENTIFIER: &str = "it.cassafiera.app";

/// Al primo avvio con il nuovo identificativo, copia il database dalla cartella delle versioni
/// precedenti. La copia vecchia resta dov'era, come riserva.
fn migrate_old_data(app: &tauri::App) {
    let Ok(new_dir) = app.path().app_config_dir() else { return };
    let Some(parent) = new_dir.parent() else { return };
    let old_dir = parent.join(OLD_IDENTIFIER);
    if new_dir.join("cassa.db").exists() || !old_dir.join("cassa.db").exists() {
        return;
    }
    if std::fs::create_dir_all(&new_dir).is_err() {
        return;
    }
    for name in ["cassa.db", "cassa.db-wal", "cassa.db-shm"] {
        let from = old_dir.join(name);
        if from.exists() {
            let _ = std::fs::copy(&from, new_dir.join(name));
        }
    }
}

/// Scrive un file nel percorso scelto dall'utente con la finestra "Salva con nome"
/// (per esempio l'esportazione delle statistiche in Excel).
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Impossibile salvare il file: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Prima di tutto, se serve, si recuperano i dati delle versioni precedenti
        .setup(|app| {
            migrate_old_data(app);
            Ok(())
        })
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
            sync::bip_request,
            mail::bip_send_email
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio della cassa");
}
