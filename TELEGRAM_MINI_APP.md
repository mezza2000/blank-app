# Rosta ↔ Torino — Telegram Mini App

Mini App Telegram per il tragitto:

- **Andata:** Rosta 07:50 → Torino Porta Nuova → Metro M1 fino a Marche
- **Ritorno:** uscita lavoro 17:00 → Metro Marche → Porta Nuova → Rosta 17:45

## Come pubblicarla con GitHub Pages

1. Apri il repository su GitHub.
2. Vai in **Settings → Pages**.
3. In **Build and deployment**, scegli **Deploy from a branch**.
4. Seleziona il branch **telegram-mini-app** e la cartella **/(root)**.
5. Salva.
6. GitHub mostrerà un URL HTTPS del tipo `https://mezza2000.github.io/blank-app/`.

## Come collegarla a Telegram

1. Apri **@BotFather** su Telegram.
2. Crea un bot con `/newbot` se non ne hai già uno.
3. In BotFather apri **Bot Settings → Menu Button → Configure menu button**.
4. Come URL inserisci l'URL GitHub Pages della Mini App.
5. Dai al pulsante un nome, per esempio **Apri Viaggio**.

A quel punto, aprendo la chat del bot, comparirà il pulsante per aprire la Mini App direttamente dentro Telegram.

## Dati live

L'interfaccia è già pronta. Al momento:

- il countdown metro usa una frequenza programmata di 5 minuti;
- il ritardo treno è predisposto per ricevere dati da un backend tramite `/api/status`;
- per avere ritardi RFI e passaggi GTT reali serve collegare un piccolo backend, perché un sito GitHub Pages statico può essere bloccato dalle policy CORS dei servizi esterni.

Nel file `index.html` trovi la variabile:

```js
const API_BASE = '';
```

Quando il backend sarà online basterà inserire lì il suo URL HTTPS.
