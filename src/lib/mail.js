import { getMeta, setMeta, isTauri } from './db/index.js';

// Invio di email dalla cassa principale (SMTP). I dati della casella restano solo su questa cassa.

const KEYS = ['host', 'port', 'security', 'user', 'password', 'from_name', 'from_email', 'recipients'];

export async function mailConfig() {
  const c = {};
  for (const k of KEYS) c[k] = (await getMeta('mail_' + k, '')) || '';
  c.port = c.port ? Number(c.port) : 465;
  c.security = c.security || 'ssl';
  return c;
}

export async function saveMailConfig(c) {
  for (const k of KEYS) await setMeta('mail_' + k, c[k] === undefined || c[k] === null ? '' : String(c[k]));
}

export const mailReady = (c) => !!(c.host && c.port && c.recipients && (c.from_email || c.user));

/** "a@x.it, b@y.it" oppure uno per riga → elenco di indirizzi */
export const parseRecipients = (text) => String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const PRESETS = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: 465, security: 'ssl', note: 'Serve una "password per le app": la generi dalle impostazioni di sicurezza del tuo account Google, con la verifica in due passaggi attiva.' },
  { name: 'Aruba', host: 'smtps.aruba.it', port: 465, security: 'ssl', note: 'Utente: l\'indirizzo email completo. Password: quella della casella.' },
  { name: 'Outlook', host: 'smtp-mail.outlook.com', port: 587, security: 'starttls', note: 'Alcuni account Microsoft non permettono l\'invio da programmi esterni: se non funziona, usa un\'altra casella.' }
];

export async function sendMail(config, { to, subject, body, attachmentName = null, bytes = null }) {
  if (!isTauri()) {
    // Browser di sviluppo: l'invio è simulato
    await new Promise((r) => setTimeout(r, 400));
    console.info('[email simulata]', { to, subject, attachmentName, size: bytes?.length });
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('bip_send_email', {
    config: {
      host: config.host, port: Number(config.port), security: config.security, user: config.user, password: config.password,
      from_name: config.from_name, from_email: config.from_email
    },
    to,
    subject,
    body,
    attachmentName,
    attachment: bytes ? Array.from(bytes) : null
  });
}
