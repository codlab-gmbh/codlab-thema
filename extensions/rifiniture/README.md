# Rifiniture — `rifiniture@codlab.de`

*English: a stylesheet-only extension that keeps the filled active states of GNOME Shell (quick settings, today in the
calendar) readable, with white text at AA contrast, also under Blur my Shell.*

Solo foglio di stile, nessun codice: gli stati attivi pieni (interruttori del menu rapido, il giorno di oggi nel
calendario) hanno il testo bianco a contrasto AA (≥ 4,5:1) anche sotto Blur my Shell, senza cambiare l'accento `blue`.
Sta in un'estensione e non nel tema perché il foglio di un'estensione, a specificità più alta, vince sui fogli delle
altre estensioni; lo stesso foglio nel tema utente perde contro Blur my Shell.

Requisiti: GNOME Shell 51.

## Installare e togliere

```bash
cp -r rifiniture@codlab.de ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable rifiniture@codlab.de

gnome-extensions disable rifiniture@codlab.de
rm -r ~/.local/share/gnome-shell/extensions/rifiniture@codlab.de
```

Licenza: vedi [LICENSE.md](../../LICENSE.md).

## Pacchetto di sistema

Il pacchetto `codlab-thema` installa questo componente sotto `/usr` e usa
`codlab-thema attiva|disattiva|stato` per il singolo utente. Vedi la
[guida dei pacchetti](../../packaging/README.md). Le istruzioni precedenti restano per la posa
manuale dal sorgente; le copie personali hanno precedenza sulle copie di sistema.
