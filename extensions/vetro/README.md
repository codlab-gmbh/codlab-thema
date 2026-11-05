# Vetro CodLab — `vetro@codlab.de`

*English: a liquid-glass material for the GNOME Shell top bar, dock, panel menus, notification banners and OSDs, with
text kept at 4.5:1 contrast or better and a safe fallback when the shader fails.*

Un vetro liquido nostro per la barra in alto, il dock (Dash to Dock), i menu del pannello (menu rapido e calendario
compresi), i banner delle notifiche e gli OSD:

- lente e filo di luce sul bordo, riflesso che segue il puntatore con calma (fermo con «riduci animazioni»);
- il vetro passa da fumé a latteo secondo ciò che sta dietro, e il testo resta sempre ≥ 4,5:1;
- un solo shader GLSL (`materiale.glsl`) e una texture per superficie (`vetro.js`); la tecnica di cattura è stata
  imparata leggendo Blur my Shell, il codice è scritto da capo;
- si spegne da solo se lo shader fallisce (canarino all'avvio, sentinella di crash, cane da guardia nella pittura) e
  scrive il suo stato vero in `~/.local/state/vetro-codlab/stato.json` e nel journal (`vetro-codlab: …`).

Perché un'estensione nostra e non un fork di Blur my Shell o uno strato sopra: una patch alla copia installata la
cancella il primo aggiornamento, un fork non può caricarsi accanto all'originale (nomi di tipo e schema in comune) e uno
strato sopra può solo aggiungere luce, non togliere il velo né piegare lo sfondo. Blur my Shell resta per la panoramica
e le cartelle.

Requisiti: GNOME Shell 51. Dash to Dock e Blur my Shell sono facoltativi.

## Installare

Solo utente, niente sudo. Vale dal prossimo login (la Shell vede una cartella d'estensione nuova solo all'avvio).

```bash
python3 posa/vetro_posa.py posa            # a secco: dice che cosa farebbe
python3 posa/vetro_posa.py posa --esegui   # copia, abilita, spegne Blur my Shell su barra, dock e popup
python3 posa/vetro_posa.py stato           # 0 acceso, 1 spento (guasto o interruttore), 2 non acceso
```

La posa scrive una ricevuta del «prima» in `posa/ritorni/<ora>/`. A mano: copiare `vetro@codlab.de/` in
`~/.local/share/gnome-shell/extensions/` e, dopo il login, `gnome-extensions enable vetro@codlab.de`.

## Spegnere e togliere

```bash
touch ~/.config/vetro-codlab/spento                                   # spegnimento rapido, vale al login dopo
python3 posa/vetro_posa.py ritorno posa/ritorni/<ora> --esegui        # rimette le chiavi com'erano e toglie la cartella
```

A mano: `gnome-extensions disable vetro@codlab.de`, poi `rm -r ~/.local/share/gnome-shell/extensions/vetro@codlab.de
~/.local/state/vetro-codlab`.

Licenza: GPL-3.0-or-later (vedi [LICENSE.md](../../LICENSE.md)).
