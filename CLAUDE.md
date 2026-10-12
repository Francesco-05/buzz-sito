# BUZZ — sito pubblico www.buzzstudio.it

Sito di presentazione di BUZZ Studio. Il proprietario è Francesco, che non è uno sviluppatore: spiegagli
le modifiche in italiano semplice e chiedi conferma prima di pubblicare qualsiasi cosa.

## Com'è fatto
- HTML, CSS e JavaScript scritti a mano, senza librerie e senza strumenti di compilazione.
  - `index.html` — la pagina. `index.php` la serve con le intestazioni di sicurezza (CSP: niente script dentro l'HTML).
  - `assets/css/sito.css` — tutta la grafica. `assets/js/sito.js` — animazioni, ingresso "Alza il volume", lettore video.
  - `assets/js/contatti.js` e `assets/js/candidature.js` — invio dei due moduli (logica invariata dal sito del 25/09/2026).
  - `buzz-api/contact.php` (richieste commerciali → gestionale) e `buzz-api/careers.php` (candidature → email).
  - `privacy/index.html` — informativa: il testo si cambia solo con l'ok di Francesco.
- Chi ha attivato "riduci movimento" nel telefono vede il sito fermo: ogni effetto nuovo va spento anche in quel caso.

## Cosa NON è nel repository (resta solo su Aruba)
- `app/` — il gestionale (repository `buzz-gestionale`). Non toccarlo da qui.
- `buzz-api/private/` — impostazioni segrete e stato dei moduli.
- I video `.mp4` dei casi studio (troppo pesanti per GitHub).

## Pubblicazione
- `.github/workflows/pubblica.yml` carica il sito su Aruba via FTPS a ogni merge su `main` (attivato con l'ok di Francesco
  il 12/10/2026). Unico secret: `FTP_PASSWORD` (password Aruba). Esclude `app/`, `buzz-api/private/` e i video.
- I file tolti dal repository non vengono cancellati dal server: vanno rimossi a mano.
- `backup-sito-2026-09-25` è il sito com'era online prima della nuova grafica.

## Regole
- Nessuna pubblicazione senza il via esplicito di Francesco; lavora su un branch e apri una pull request.
- Prima di proporre una modifica: provala su computer e telefono (Chromium è disponibile) e controlla che
  non ci siano errori JavaScript.
- Mai credenziali nel repository.
