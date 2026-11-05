# Svuota tutte le notifiche — `svuota-notifiche@codlab`

*English: adds a "Clear all" button next to the close button of every notification banner and notification.*

Accanto alla X di ogni banner e di ogni notifica nel centro aggiunge il pulsante «Svuota tutto», che chiude tutte le
notifiche con lo stesso metodo del pulsante «Pulisci» del calendario. L'estensione osserva soltanto i contenitori:
nessun metodo della Shell sostituito, nessuna azione delle applicazioni cambiata.

Dopo le animazioni, se esiste, lancia anche `~/.local/bin/notifiche cancella --tutte` (uno strumento locale, non incluso
in questo repository) per chiudere le notifiche arrivate nel frattempo; se il comando manca, l'errore va soltanto nel
journal (`[svuota-notifiche]`) e le notifiche restano comunque svuotate.

Nota: l'UUID è `svuota-notifiche@codlab` (senza `.de`), come nella versione installata.

Requisiti: GNOME Shell 51.

## Installare e togliere

```bash
cp -r svuota-notifiche@codlab ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable svuota-notifiche@codlab

gnome-extensions disable svuota-notifiche@codlab
rm -r ~/.local/share/gnome-shell/extensions/svuota-notifiche@codlab
```

Licenza: vedi [LICENSE.md](../../LICENSE.md).

## Pacchetto di sistema

Il pacchetto `codlab-thema` installa questo componente sotto `/usr` e usa
`codlab-thema attiva|disattiva|stato` per il singolo utente. Vedi la
[guida dei pacchetti](../../packaging/README.md). Le istruzioni precedenti restano per la posa
manuale dal sorgente; le copie personali hanno precedenza sulle copie di sistema.
