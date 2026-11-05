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
