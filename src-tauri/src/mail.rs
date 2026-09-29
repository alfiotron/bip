//! Invio di un'email con allegato tramite SMTP (usato per il report delle vendite).

use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Address, Message, SmtpTransport, Transport};
use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
pub struct SmtpConfig {
    host: String,
    port: u16,
    security: String, // "ssl" | "starttls" | "none"
    user: String,
    password: String,
    from_name: String,
    from_email: String,
}

fn mailbox(name: &str, email: &str) -> Result<Mailbox, String> {
    let addr: Address = email.trim().parse().map_err(|_| format!("Indirizzo email non valido: {email}"))?;
    Ok(Mailbox::new(if name.trim().is_empty() { None } else { Some(name.trim().to_string()) }, addr))
}

fn friendly(e: lettre::transport::smtp::Error) -> String {
    let t = e.to_string();
    let l = t.to_lowercase();
    if e.is_permanent() && (l.contains("auth") || l.contains("535") || l.contains("534") || l.contains("credentials")) {
        return format!("Il server ha rifiutato utente o password. Controlla i dati (con Gmail serve una password per le app). Dettaglio: {t}");
    }
    if l.contains("timed out") || l.contains("timeout") {
        return format!("Il server di posta non risponde. Controlla la connessione a internet, il server e la porta. Dettaglio: {t}");
    }
    if l.contains("dns") || l.contains("lookup") || l.contains("resolve") || l.contains("connection refused") || l.contains("network") {
        return format!("Impossibile raggiungere il server di posta: controlla la connessione a internet e il nome del server. Dettaglio: {t}");
    }
    format!("Invio non riuscito: {t}")
}

#[tauri::command]
pub async fn bip_send_email(
    config: SmtpConfig,
    to: Vec<String>,
    subject: String,
    body: String,
    attachment_name: Option<String>,
    attachment: Option<Vec<u8>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let from_email = if config.from_email.trim().is_empty() { config.user.clone() } else { config.from_email.clone() };
        let mut builder = Message::builder().from(mailbox(&config.from_name, &from_email)?).subject(subject);
        if to.is_empty() {
            return Err("Nessun destinatario.".to_string());
        }
        for t in &to {
            builder = builder.to(mailbox("", t)?);
        }
        let text = SinglePart::plain(body);
        let message = match (attachment, attachment_name) {
            (Some(bytes), Some(name)) => {
                let kind = ContentType::parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").unwrap();
                builder.multipart(MultiPart::mixed().singlepart(text).singlepart(Attachment::new(name).body(bytes, kind)))
            }
            _ => builder.singlepart(text),
        }
        .map_err(|e| format!("Email non valida: {e}"))?;

        let host = config.host.trim();
        let transport = match config.security.as_str() {
            "ssl" => SmtpTransport::relay(host).map_err(friendly)?,
            "starttls" => SmtpTransport::starttls_relay(host).map_err(friendly)?,
            _ => SmtpTransport::builder_dangerous(host),
        }
        .port(config.port)
        .timeout(Some(Duration::from_secs(30)));
        let transport = if config.user.trim().is_empty() {
            transport
        } else {
            transport.credentials(Credentials::new(config.user.trim().to_string(), config.password.clone()))
        };
        transport.build().send(&message).map(|_| ()).map_err(friendly)
    })
    .await
    .map_err(|e| e.to_string())?
}
