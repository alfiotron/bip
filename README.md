# Bip

Cassa per vendere alle fiere fumetti, libri, giochi da tavolo, gadget e qualunque altro prodotto,
pensata per un mini PC con touch screen e lettore di codici a barre USB. Funziona completamente offline.

Tecnologie: [Tauri 2](https://tauri.app) (il contenitore dell'app), [Svelte 5](https://svelte.dev)
(l'interfaccia) e SQLite (il database, un singolo file).

## Preparare il Mac (una volta sola)

1. Strumenti di sviluppo Apple: `xcode-select --install`
2. Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`, poi chiudi e riapri il Terminale
3. Node.js LTS: da [nodejs.org](https://nodejs.org) oppure `brew install node`

Poi, nella cartella del progetto:

```bash
npm install
```

## Comandi di tutti i giorni

| Comando | Cosa fa |
|---|---|
| `npm run tauri dev` | Apre l'app vera, con il database SQLite. Le modifiche all'interfaccia si vedono subito. |
| `npm run dev` | Apre l'interfaccia nel browser su http://localhost:1420, con un database temporaneo. Utile per lavorare velocemente sulla grafica. |
| `npm run tauri build` | Crea l'app per il sistema su cui ti trovi (su Mac un `.app` e un `.dmg`). |

La prima volta `npm run tauri dev` impiega qualche minuto perché compila la parte in Rust.
Le volte successive parte in pochi secondi.

Per provare subito la cassa: menu in alto a destra → **Impostazioni** → **Carica dati di prova**.
Puoi collegare lo scanner USB al Mac e leggere i codici dei libri veri: quelli non in catalogo
verranno segnalati, e dalla scheda **Prodotti** puoi crearli leggendone il codice.

## Compilare gli installer con GitHub Actions

Il file `.github/workflows/build.yml` compila Bip sui server di GitHub per Windows, macOS e Linux.

**Una nuova versione, per tutte le piattaforme:**

1. Aggiorna `"version"` in `package.json` (per esempio da `0.1.0` a `0.2.0`). È l'unico punto da cambiare:
   `src-tauri/tauri.conf.json` legge la versione da lì.
2. Salva le modifiche in Git e caricale su GitHub.
3. Pubblica il tag: `git tag v0.2.0 && git push origin v0.2.0`
4. Nella scheda **Actions** di GitHub attendi la fine delle compilazioni.
5. Nella scheda **Releases** trovi una bozza con tutti gli installer: controllala e pubblicala.

**Solo una prova, scegliendo le piattaforme:** scheda **Actions** → **Compila Bip** → **Run workflow**,
spunta i sistemi che ti servono e avvia. Gli installer si scaricano in fondo alla pagina della compilazione,
nella sezione **Artifacts**.

Cosa si ottiene:

| Sistema | File | Note |
|---|---|---|
| Windows | `.exe` e `.msi` | Include WebView2: funziona anche su un PC senza internet. Al primo avvio: *Ulteriori informazioni* → *Esegui comunque*. |
| macOS | `.dmg` (Apple Silicon e Intel) | L'app non è firmata: la prima volta aprila con clic destro → *Apri*. |
| Linux | `.deb`, `.rpm`, `.AppImage` | Richiede una distribuzione recente (Ubuntu 22.04 o successiva). |

I minuti di GitHub Actions per i repository privati sono limitati, e macOS ne consuma molti più di
Windows e Linux. Per le prove conviene compilare solo le piattaforme che servono.

## Fatture in Cloud

La cassa legge da Fatture in Cloud, in sola lettura, l'anagrafica prodotti e i DDT emessi.
Il collegamento usa un token generato manualmente (la "Manual Authentication" descritta su
developers.fattureincloud.it), con i permessi in lettura **Prodotti** e **DDT**. Il token si
incolla una volta in Impostazioni e resta solo su quella cassa.

Nel browser di sviluppo (`npm run dev`) Fatture in Cloud è simulato con dati di prova
(`src/lib/fic-mock.js`): qualunque token di almeno 6 caratteri viene accettato.

## Più casse

Al primo avvio Bip chiede se è la **cassa principale** o se deve **collegarsi a una principale**.
Le secondarie trovano la principale da sole sulla stessa rete (router dello stand o hotspot, internet non serve),
oppure con il suo indirizzo IP, e si abbinano con un codice di 6 cifre mostrato dalla principale nella scheda **Casse**.
Da lì si sincronizzano da sole ogni pochi secondi.

La parte di rete in Rust (`src-tauri/src/sync.rs`) fa solo da trasporto: server HTTP sulla porta 47800,
ricerca automatica (mDNS, servizio `_bip._tcp`) e richieste verso la principale. Le regole della
sincronizzazione sono in `src/lib/sync/`.

Nel browser di sviluppo si possono simulare più casse aprendo più schede con indirizzi diversi:
`http://localhost:1420/?cassa=1` e `http://localhost:1420/?cassa=2` (ognuna ha il suo database).

## Nome e icona

L'icona è in `app-icon.svg` (sorgente modificabile) e `app-icon.png` (1024 × 1024).
Per rigenerare tutti i formati dopo una modifica:

```bash
npx tauri icon app-icon.png -o src-tauri/icons
```

L'identificativo interno dell'app (`it.cassafiera.bip` in `src-tauri/tauri.conf.json`) **non va cambiato**:
decide la cartella in cui si trova il database. Le prime versioni usavano `it.cassafiera.app`: al primo avvio
Bip copia da sola il database dalla vecchia cartella alla nuova (`src-tauri/src/lib.rs`, `migrate_old_data`),
lasciando la copia vecchia come riserva.

## Come è organizzato il codice

```
src/
  App.svelte              schermata attiva e scanner
  app.css                 colori e stili (derivati dal mockup)
  screens/                le schermate: Cassa, Prodotti, Dotazione, DDT, Statistiche, Eventi, Impostazioni
    fic/                  importazioni da Fatture in Cloud
  components/             elementi riutilizzabili (icone, copertine, tastierino, avvisi)
  lib/
    db/schema.js          struttura del database
    journal.js            registro di tutte le modifiche (base della sincronizzazione tra casse)
    apply.js              come ogni registrazione modifica le tabelle
    state.svelte.js       stato condiviso dell'app
    pos.svelte.js         carrello e vendita
    scanner.js            riconoscimento del lettore di codici a barre
    stock.js              calcolo della dotazione (portati, venduti, rimasti)
    transfers.js          DDT e rientri
    stats.js              statistiche di un evento
    fic.js                richieste a Fatture in Cloud
    deletion.js           eliminazione di prodotti ed eventi
    brands.js             marchi dei prodotti
    xlsx.js, export.js    creazione ed esportazione dei file Excel
src-tauri/                parte Rust: apre la finestra e fornisce il database
```

### Il journal

Ogni modifica (un prodotto salvato, una vendita, un evento chiuso) viene scritta prima nel
**journal**, con il codice della cassa che l'ha fatta e un numero progressivo, e poi applicata
alle tabelle. Per unire i dati di più casse, con la chiavetta o in rete, basterà scambiarsi le
voci del journal che mancano: ogni voce ha un identificativo univoco, quindi non si creano doppioni.

**Regola importante:** non modificare mai direttamente le tabelle `sales`, `products` eccetera.
Usa sempre `record(tipo, dati)` da `lib/journal.js`.

## Stato dello sviluppo

- [x] Fase 1: cassa (scanner, carrello, sconti, arrotondamenti, contanti con resto, carta, omaggi, voci libere, IVA), prodotti, eventi, impostazioni
- [x] Fase 2: dotazione dell'evento, DDT (rifornimenti e consegne ai negozi, rientri, riepilogo stampabile), statistiche
- [x] Fase 3: importazione di prodotti e DDT da Fatture in Cloud
- [x] Eliminazione di prodotti ed eventi, statistiche per giorno, andamento dei singoli prodotti, esportazione in Excel
- [x] Logo e nome dell'attività, marchi dei prodotti con statistiche per marchio
- [x] Fase 4: più casse in rete locale (cassa principale e casse secondarie)
- [ ] Fase 5: installazione sul mini PC (schermo intero, avvio automatico)
