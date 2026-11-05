# Quiete delle aree — `quiete-aree@codlab.de`

*English: after a keyboard workspace switch, GNOME Shell's dynamic-workspace check waits until updates are unblocked
instead of re-queueing itself on every frame.*

Nella Shell 51 a ogni cambio d'area «switch-workspace» mette in coda il controllo delle aree dinamiche prima del
ridisegno; se gli aggiornamenti delle aree sono bloccati (lo fa il popup delle aree mentre è a schermo), il controllo si
rimette in coda a ogni fotogramma e tiene il frame clock acceso a vuoto. Con questa estensione il controllo aspetta lo
sblocco: niente fotogrammi a vuoto mentre il popup delle aree è a schermo. Disabilitandola torna il comportamento di
serie.

Requisiti: GNOME Shell 51.

## Installare e togliere

```bash
cp -r quiete-aree@codlab.de ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable quiete-aree@codlab.de

gnome-extensions disable quiete-aree@codlab.de
rm -r ~/.local/share/gnome-shell/extensions/quiete-aree@codlab.de
```

Licenza: vedi [LICENSE.md](../../LICENSE.md).
