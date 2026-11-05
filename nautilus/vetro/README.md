# Vetro dentro File — `codlab-vetro.py`

*English: a nautilus-python extension that turns the Files (Nautilus) sidebar — and, in variant B, the header bar — into
glass blurred by Mutter, only inside Files and only where the blur is real.*

Un'estensione nautilus-python che carica un foglio di stile solo dentro File (Nautilus), con la priorità appena sopra
il `gtk.css` dell'utente; nessun'altra app GTK 4 cambia.

- **Comune** (`comune.css`): la barra laterale è vetro, la tinta della barra al 74 % sopra lo sfondo sfocato da Mutter
  (GTK 4.24 chiede la sfocatura con il protocollo `ext-background-effect-v1`); il testo resta ≥ 4,5:1.
- **Variante B** (`variante-b.css`, si aggiunge dopo `comune.css`): anche la barra del titolo e le schede sono vetro;
  il contenuto sotto resta pieno. È la variante installata sul nostro desktop.

Si accende solo dove il vetro è vero: display Wayland e GTK ≥ 4.24 (su X11 la barra sarebbe trasparente senza
sfocatura). Con il contrasto elevato il foglio si toglie da solo e File torna pieno come libadwaita. Ogni guasto va su
stderr e lascia File com'è.

Requisiti: Nautilus 51 con nautilus-python (su Fedora il pacchetto `nautilus-python`), GTK 4.24, sessione Wayland.

## Installare

```bash
mkdir -p ~/.local/share/nautilus-python/extensions
cp codlab-vetro.py ~/.local/share/nautilus-python/extensions/
cat comune.css variante-b.css > ~/.local/share/nautilus-python/extensions/codlab-vetro.css   # variante B
# oppure, solo la barra laterale:  cat comune.css > ~/.local/share/nautilus-python/extensions/codlab-vetro.css
nautilus -q   # vale alla prossima partenza di File
```

Il foglio si rilegge a caldo quando cambia.

## Spegnere e togliere

```bash
mkdir -p ~/.config/codlab-vetro && touch ~/.config/codlab-vetro/spento   # spento entro 2 s, senza riavviare File
rm ~/.local/share/nautilus-python/extensions/codlab-vetro.py ~/.local/share/nautilus-python/extensions/codlab-vetro.css
nautilus -q
```

Licenza: GPL-3.0-or-later (vedi [LICENSE.md](../../LICENSE.md)).

## Pacchetto di sistema

Il pacchetto `codlab-thema` installa questo componente sotto `/usr` e usa
`codlab-thema attiva|disattiva|stato` per il singolo utente. Vedi la
[guida dei pacchetti](../../packaging/README.md). Le istruzioni precedenti restano per la posa
manuale dal sorgente; le copie personali hanno precedenza sulle copie di sistema.
