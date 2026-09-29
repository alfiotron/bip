//! Rete tra le casse: solo "trasporto".
//!
//! Tutta la logica della sincronizzazione (quali registrazioni scambiare, abbinamento,
//! controlli) è scritta in JavaScript, in `src/lib/sync/`. Qui ci sono solo:
//! - il piccolo server HTTP della cassa principale, che passa ogni richiesta all'interfaccia
//!   (evento `bip-request`) e aspetta la risposta (comando `bip_respond`);
//! - la pubblicazione e la ricerca automatica delle casse sulla rete locale (mDNS);
//! - le richieste HTTP di una cassa secondaria verso la principale;
//! - l'elenco degli indirizzi IP di questo computer.

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SERVICE_TYPE: &str = "_bip._tcp.local.";
const MAX_BODY: u64 = 64 * 1024 * 1024;

struct Reply {
    status: u16,
    body: String,
}

struct Running {
    server: Arc<tiny_http::Server>,
    mdns: Option<ServiceDaemon>,
    port: u16,
}

fn running() -> &'static Mutex<Option<Running>> {
    static R: OnceLock<Mutex<Option<Running>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(None))
}

fn pending() -> &'static Mutex<HashMap<u64, Sender<Reply>>> {
    static P: OnceLock<Mutex<HashMap<u64, Sender<Reply>>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
struct IncomingRequest {
    id: u64,
    method: String,
    path: String,
    body: String,
    remote: String,
    headers: HashMap<String, String>,
}

fn json_response(status: u16, body: String) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap();
    tiny_http::Response::from_string(body).with_status_code(status).with_header(header)
}

fn handle(app: AppHandle, mut req: tiny_http::Request) {
    let mut body = String::new();
    if req.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
        let _ = req.respond(json_response(400, r#"{"error":"Richiesta non leggibile"}"#.into()));
        return;
    }
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = channel();
    pending().lock().unwrap().insert(id, tx);
    let headers = req
        .headers()
        .iter()
        .map(|h| (h.field.as_str().as_str().to_ascii_lowercase(), h.value.as_str().to_string()))
        .collect();
    let incoming = IncomingRequest {
        id,
        method: req.method().as_str().to_string(),
        path: req.url().to_string(),
        body,
        remote: req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default(),
        headers,
    };
    let reply = if app.emit("bip-request", incoming).is_ok() {
        rx.recv_timeout(Duration::from_secs(60)).ok()
    } else {
        None
    };
    pending().lock().unwrap().remove(&id);
    let reply = reply.unwrap_or(Reply { status: 503, body: r#"{"error":"La cassa principale non ha risposto in tempo"}"#.into() });
    let _ = req.respond(json_response(reply.status, reply.body));
}

/// Avvia il server della cassa principale e la pubblica sulla rete. Restituisce la porta usata.
#[tauri::command]
pub fn bip_server_start(app: AppHandle, port: u16, name: String, properties: HashMap<String, String>) -> Result<u16, String> {
    bip_server_stop();
    // Se la porta è occupata, prova le successive
    let mut last_err = String::new();
    for p in port..port + 10 {
        match tiny_http::Server::http(("0.0.0.0", p)) {
            Ok(server) => {
                let server = Arc::new(server);
                let srv = server.clone();
                let app2 = app.clone();
                std::thread::spawn(move || {
                    for req in srv.incoming_requests() {
                        let app3 = app2.clone();
                        std::thread::spawn(move || handle(app3, req));
                    }
                });
                // Pubblicazione mDNS: se fallisce, la cassa resta raggiungibile con l'indirizzo IP
                let mdns = ServiceDaemon::new().ok().and_then(|d| {
                    let host = format!("bip-{}.local.", properties.get("till").cloned().unwrap_or_else(|| "cassa".into()).to_lowercase());
                    let info = ServiceInfo::new(SERVICE_TYPE, &name, &host, (), p, properties.clone()).ok()?.enable_addr_auto();
                    d.register(info).ok()?;
                    Some(d)
                });
                *running().lock().unwrap() = Some(Running { server, mdns, port: p });
                return Ok(p);
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(format!("Impossibile mettersi in ascolto sulla rete: {last_err}"))
}

#[tauri::command]
pub fn bip_server_stop() {
    if let Some(r) = running().lock().unwrap().take() {
        r.server.unblock();
        if let Some(d) = r.mdns {
            let _ = d.shutdown();
        }
    }
}

#[tauri::command]
pub fn bip_server_port() -> Option<u16> {
    running().lock().unwrap().as_ref().map(|r| r.port)
}

/// Risposta dell'interfaccia a una richiesta arrivata al server.
#[tauri::command]
pub fn bip_respond(id: u64, status: u16, body: String) {
    if let Some(tx) = pending().lock().unwrap().remove(&id) {
        let _ = tx.send(Reply { status, body });
    }
}

#[derive(Serialize)]
pub struct Found {
    name: String,
    addresses: Vec<String>,
    port: u16,
    properties: HashMap<String, String>,
}

/// Cerca le casse principali sulla rete locale per qualche secondo.
#[tauri::command]
pub async fn bip_discover(timeout_ms: u64) -> Result<Vec<Found>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let rx = daemon.browse(SERVICE_TYPE).map_err(|e| e.to_string())?;
        let end = Instant::now() + Duration::from_millis(timeout_ms);
        let mut out: HashMap<String, Found> = HashMap::new();
        while let Some(left) = end.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    let mut addresses: Vec<String> = info.get_addresses_v4().iter().map(|a| a.to_string()).collect();
                    addresses.sort();
                    let properties = info
                        .get_properties()
                        .iter()
                        .map(|p| (p.key().to_string(), p.val_str().to_string()))
                        .collect();
                    let name = info.get_fullname().trim_end_matches(SERVICE_TYPE).trim_end_matches('.').to_string();
                    out.insert(info.get_fullname().to_string(), Found { name, addresses, port: info.get_port(), properties });
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = daemon.shutdown();
        Ok(out.into_values().collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Indirizzi IPv4 di questo computer sulla rete locale.
#[tauri::command]
pub fn bip_local_ips() -> Vec<String> {
    let mut ips: Vec<String> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            std::net::IpAddr::V4(v4) if !v4.is_link_local() => Some(v4.to_string()),
            _ => None,
        })
        .collect();
    ips.sort();
    ips.dedup();
    ips
}

#[derive(Serialize)]
pub struct HttpReply {
    status: u16,
    body: String,
}

/// Richiesta HTTP da una cassa secondaria verso la principale.
#[tauri::command]
pub async fn bip_request(url: String, body: Option<String>, headers: HashMap<String, String>, timeout_ms: u64) -> Result<HttpReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_millis(timeout_ms)).build();
        let mut req = match body {
            Some(_) => agent.post(&url),
            None => agent.get(&url),
        };
        for (k, v) in headers.iter() {
            req = req.set(k, v);
        }
        let result = match body {
            Some(b) => req.set("Content-Type", "application/json").send_string(&b),
            None => req.call(),
        };
        match result {
            Ok(r) => {
                let status = r.status();
                Ok(HttpReply { status, body: r.into_string().unwrap_or_default() })
            }
            Err(ureq::Error::Status(code, r)) => Ok(HttpReply { status: code, body: r.into_string().unwrap_or_default() }),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
