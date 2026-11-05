# Dock dal bordo — `dock-dal-bordo@codlab.de`

*English: on monitors other than the primary one, the Dash to Dock dock is hidden and appears when the pointer pushes
against the bottom edge, like the macOS Dock with "automatically hide".*

Sul monitor che non è il principale il dock di Dash to Dock non resta a schermo: compare quando il puntatore spinge sul
bordo basso e sparisce quando lo lascia, come il Dock di macOS con «nascondi automaticamente». Il dock del monitor
principale non cambia. L'estensione usa solo le proprietà pubbliche dei dock; disabilitandola i dock tornano a Dash to
Dock.

**Versione 2.** Con più monitor Dash to Dock crea il dock del secondo monitor mentre la Shell si sta ancora avviando, e
la Shell lo segnala con centinaia di avvisi `st_widget_get_theme_node … not in the stage`. Il servizio utente
`dock-fine-avvio-prima-della-shell` (in `servizio/`) parte prima della Shell: se l'opzione `multi-monitor` di Dash to
Dock è accesa la spegne e scrive un segno in `~/.config/meraviglioso/`; l'estensione la riaccende a fine avvio, e il
dock del secondo monitor nasce a Shell avviata. Se `multi-monitor` è spenta di proposito, non tocca niente.

Requisiti: GNOME Shell 51, Dash to Dock con «mostra su tutti i monitor» (`multi-monitor`) acceso.

## Installare

```bash
cp -r dock-dal-bordo@codlab.de ~/.local/share/gnome-shell/extensions/
install -D -m 755 servizio/dock-fine-avvio-prima-della-shell ~/.local/bin/dock-fine-avvio-prima-della-shell
install -D -m 644 servizio/dock-fine-avvio-prima-della-shell.service \
    ~/.config/systemd/user/dock-fine-avvio-prima-della-shell.service
systemctl --user daemon-reload
systemctl --user enable dock-fine-avvio-prima-della-shell.service
# al login successivo:
gnome-extensions enable dock-dal-bordo@codlab.de
```

## Togliere

```bash
gnome-extensions disable dock-dal-bordo@codlab.de
systemctl --user disable dock-fine-avvio-prima-della-shell.service
rm -r ~/.local/share/gnome-shell/extensions/dock-dal-bordo@codlab.de
rm ~/.local/bin/dock-fine-avvio-prima-della-shell ~/.config/systemd/user/dock-fine-avvio-prima-della-shell.service
systemctl --user daemon-reload
rm -f ~/.config/meraviglioso/dock-dal-bordo-* ~/.config/meraviglioso/.fatto-dock-*
```

Licenza: vedi [LICENSE.md](../../LICENSE.md).
