# Rimbalzo nel dock — `rimbalzo@codlab.de`

*English: the icon of an app that is starting bounces in the dock until the app is ready, like the macOS Dock.*

Come il Dock di macOS con «Animazione apertura applicazioni»: l'icona dell'app che si sta avviando rimbalza nel dock di
Dash to Dock e nella dash della panoramica finché l'app non è pronta (al massimo 6 salti). Un'app fissata che parte
lenta salta finché non è pronta; un lancio che non diventa mai pronto smette da solo. Solo animazione, nessuna
impostazione.

Stato: prototipo. Requisiti: GNOME Shell 51; Dash to Dock facoltativo.

## Installare e togliere

```bash
cp -r rimbalzo@codlab.de ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable rimbalzo@codlab.de

gnome-extensions disable rimbalzo@codlab.de
rm -r ~/.local/share/gnome-shell/extensions/rimbalzo@codlab.de
```

Licenza: GPL-2.0-or-later, come dichiarato in testa a `extension.js` (vedi anche [LICENSE.md](../../LICENSE.md)).
