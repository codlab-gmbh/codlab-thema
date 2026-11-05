# Launchpad CodLab — `launchpad@codlab.de`

*English: a macOS-style Launchpad for GNOME Shell — tapping Super opens the full-screen app grid over the blurred
wallpaper, without windows or workspaces.*

Le app come su macOS:

- Super (tocco) apre la griglia delle app a tutto schermo sopra lo sfondo sfocato, senza finestre né aree di lavoro,
  con l'entrata a zoom del Launchpad; se la panoramica è già aperta, la chiude;
- si scrive subito per cercare; Esc o un altro Super chiude tutto;
- la panoramica delle finestre resta all'angolo attivo e alla sua scorciatoia;
- il gestore di Super della Shell viene bloccato, non tolto: disabilitando l'estensione torna com'era.

Stato: prototipo. Requisiti: GNOME Shell 51.

## Installare e togliere

```bash
cp -r launchpad@codlab.de ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable launchpad@codlab.de

gnome-extensions disable launchpad@codlab.de
rm -r ~/.local/share/gnome-shell/extensions/launchpad@codlab.de
```

Licenza: GPL-2.0-or-later, come dichiarato in testa a `extension.js` (vedi anche [LICENSE.md](../../LICENSE.md)).
