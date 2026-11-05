# Gestione notifiche — `centro-notifiche@codlab.de`

*English: exposes a small D-Bus interface on the GNOME Shell session connection so that scripts can list and dismiss
notifications and open or close the notification centre.*

Espone sulla connessione di sessione della Shell l'oggetto `/org/codlab/Notifiche`, interfaccia `org.codlab.Notifiche`:

| Metodo | Che cosa fa |
|---|---|
| `Elenco() → s` | JSON con id, origine, titolo e ora di ogni notifica presente (mai il testo del messaggio) |
| `Cancella(s id) → b` | chiude la notifica con quell'id, come la X |
| `Centro(b apri) → b` | apre o chiude il centro notifiche e dice se era aperto |

```bash
gdbus call --session --dest org.gnome.Shell --object-path /org/codlab/Notifiche --method org.codlab.Notifiche.Elenco
```

Solo operazioni esplicite sul centro notifiche della sessione corrente; nessun codice ricevuto dal bus viene eseguito.
Come ogni servizio di sessione, è raggiungibile dai programmi dell'utente nella stessa sessione D-Bus: quei programmi
possono leggere i titoli delle notifiche e chiuderle.

Requisiti: GNOME Shell 51.

## Installare e togliere

```bash
cp -r centro-notifiche@codlab.de ~/.local/share/gnome-shell/extensions/
# al login successivo:
gnome-extensions enable centro-notifiche@codlab.de

gnome-extensions disable centro-notifiche@codlab.de
rm -r ~/.local/share/gnome-shell/extensions/centro-notifiche@codlab.de
```

Licenza: vedi [LICENSE.md](../../LICENSE.md).

## Pacchetto di sistema

Il pacchetto `codlab-thema` installa questo componente sotto `/usr` e usa
`codlab-thema attiva|disattiva|stato` per il singolo utente. Vedi la
[guida dei pacchetti](../../packaging/README.md). Le istruzioni precedenti restano per la posa
manuale dal sorgente; le copie personali hanno precedenza sulle copie di sistema.
