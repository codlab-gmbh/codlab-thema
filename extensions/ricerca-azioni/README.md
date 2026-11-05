# Recenti e azioni — `ricerca-azioni@codlab.de`

*English: adds quick actions, unit conversions, emoji with Italian names and recent files to the GNOME Shell overview
search — all local, no network.*

Nella ricerca della panoramica:

- azioni rapide: non disturbare, luce notturna, timer;
- conversioni ed emoji con i nomi italiani;
- file recenti.

Tutto locale, nessuna rete. Requisiti: GNOME Shell 51.

## Installare e togliere

```bash
cp -r ricerca-azioni@codlab.de ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable ricerca-azioni@codlab.de

gnome-extensions disable ricerca-azioni@codlab.de
rm -r ~/.local/share/gnome-shell/extensions/ricerca-azioni@codlab.de
```

Licenza: vedi [LICENSE.md](../../LICENSE.md).

## Pacchetto di sistema

Il pacchetto `codlab-thema` installa questo componente sotto `/usr` e usa
`codlab-thema attiva|disattiva|stato` per il singolo utente. Vedi la
[guida dei pacchetti](../../packaging/README.md). Le istruzioni precedenti restano per la posa
manuale dal sorgente; le copie personali hanno precedenza sulle copie di sistema.
