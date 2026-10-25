# Radar Eventi

Agenda settimanale degli eventi a Bolzano, Merano e dintorni. Legge lo stesso database Supabase
del Radar (`radar-concerti-alto-adige`), con un pannello admin e il testo pronto per WhatsApp.

- `/` sito pubblico
- `/classifica` gli eventi con più mi piace
- `/admin` gestione (settimane visibili, avvisi di prenotazione, eventi da prenotare, testo WhatsApp)

Il testo WhatsApp si prepara solo in `/admin`; il sito pubblico non lo mostra.

Stack: Vite + Tailwind CSS 4 + JavaScript senza framework + `@supabase/supabase-js`.

## Avvio locale

```bash
npm install
npm run dev        # http://localhost:5173  e  /admin.html
npm run build      # genera dist/
```

## Database (una volta sola)

1. Supabase › SQL Editor › esegui `supabase/setup.sql`. Aggiunge soltanto oggetti nuovi:
   colonna `events.booking_required`, tabelle `app_settings` e `admins`, funzione `is_admin()`,
   vista `events_site`. La vista `events_app` usata dall'app esistente non viene toccata.
2. Aggiungi la tua email agli admin:
   `insert into public.admins (email) values ('tua@email.it');`
3. Per i mi piace esegui anche `supabase/likes.sql` (tabella `event_likes` e funzioni
   `likes_for`, `toggle_like`, `top_events`).
4. Authentication › Users › Add user: crea l'utente con la stessa email e una password.

## Deploy su Netlify

1. Netlify › Add new site › Import from Git › scegli questo repository.
2. Le impostazioni arrivano da `netlify.toml` (build `npm run build`, publish `dist`).
3. Facoltativo: in Environment variables puoi impostare `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`;
   altrimenti usa i valori in `src/lib/supabase.js` (la chiave publishable è pubblica, i dati
   sono protetti dalle policy RLS).
4. Supabase › Authentication › URL Configuration: aggiungi l'indirizzo Netlify come Site URL.
   In **Redirect URLs** aggiungi anche `https://TUO-SITO.netlify.app/admin.html`: serve al link
   "Password dimenticata?" della pagina admin.

## Come si usa

| Cosa | Dove |
| --- | --- |
| Scegliere quante settimane mostrare | `/admin` › Settimane visibili › scegli da 1 a 8 › Salva. Il sito mostra blocchi di 7 giorni a partire da oggi (predefinito: 1). |
| Accendere/spegnere gli avvisi | `/admin` › Avvisi prenotazione. "Ultimo mese" (30–16 giorni) e "Ultimi 15 giorni" si attivano separatamente e si salvano subito. |
| Segnare un evento da prenotare | `/admin` › Eventi da prenotare › spunta. |
| Password dimenticata | `/admin` › scrivi l'email › "Password dimenticata?". Il link dell'email apre la pagina per scegliere la nuova password. |
| Mi piace | Sul sito, il cuore accanto a ogni evento (e nella scheda). Un voto per evento per browser; si toglie toccandolo di nuovo. Classifica in `/classifica`. |
| Testo WhatsApp | Solo in `/admin` › Testo WhatsApp: scegli settimana e zona, poi Copia testo. |

Formato del testo: `*grassetto*` e `_corsivo_` di WhatsApp, un blocco per giorno, link su riga
propria (WhatsApp li rende cliccabili), avviso di prenotazione se attivo, link al sito in fondo.

## Scelte UX

- **La settimana è il titolo.** La data in grande (Big Shoulders Display, rosso porfido) risponde
  subito alla domanda "cosa c'è questa settimana?" e cambia con una sola animazione.
- **Prenotare prima di scorrere.** "Da prenotare adesso" sta sopra l'agenda e mostra i giorni
  rimasti in grande: è l'azione che, se rimandata, si perde.
- **Orientarsi in un colpo d'occhio.** Striscia dei 7 giorni con il numero di eventi, filtri per zona e
  genere sempre in alto; orari allineati in colonna per scorrere la giornata.
- **Gerarchia tipografica.** Display condensato solo per date e titoli di sezione; Instrument Sans per
  il testo (17px, interlinea 1,55, righe sotto gli 80 caratteri).
- **Palette dal territorio.** Calcare `#F4F5F2`, abete `#15302A`, porfido `#8E2C38`,
  enrosadira `#F6C9BC` (il rosa delle Dolomiti al tramonto), nebbia `#5B6B65`.
- **Accessibilità.** Focus visibile, `prefers-reduced-motion`, link "Vai agli eventi", dialoghi nativi.
