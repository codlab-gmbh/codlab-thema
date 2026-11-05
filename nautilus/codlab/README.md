# Nautilus CodLab 51.1-2.4 — serie di patch e spec

*English: the CodLab patch series for GNOME Files (Nautilus) 51.1 and the RPM spec used to rebuild Fedora's
`nautilus-51.1-2.fc45` with it. Binary packages are not published here.*

Nautilus 51.1 ricostruito dal pacchetto di Fedora `nautilus-51.1-2.fc45` con otto patch CodLab, applicate in questo
ordine (`serie.json`, release `2.4.codlab`):

| Patch | Che cosa aggiunge |
|---|---|
| `barra-conteggio-elementi.patch` | il numero di elementi della cartella nella barra di stato |
| `icona-segnalibri.patch` | l'icona personalizzata di una cartella (`metadata::custom-icon-name`) anche nei segnalibri |
| `blocchi-barra.patch` | la barra laterale a gruppi comprimibili **Dischi**, **Lavoro** e **Plex**; il gruppo Plex legge `~/.config/nautilus-codlab/barra.ini`, lo stato aperto/chiuso resta in GSettings |
| `estetica-barra.patch` | dischi con il nome pulito, l'icona secondo l'etichetta e la barra dello spazio libero |
| `ricerca-solo-qui.patch` | nel popover di ricerca «Solo qui» / «Anche nelle sottocartelle» |
| `riquadro-dettagli.patch` | il riquadro dettagli a destra (Alt+P): anteprima grande e metadati, EXIF delle foto, durata e risoluzione dei video |
| `raggruppa-per.patch` | «Raggruppa per» tipo, data di modifica o dimensione nella vista a elenco |
| `configura-barra.patch` | la finestra «Configura i gruppi» della barra laterale, che non perde dati di `barra.ini` |

Le chiavi nuove stanno in uno schema nostro, `org.gnome.nautilus.codlab`, installato dal pacchetto: nessuna chiave
inventata dentro lo schema di Nautilus. Senza lo schema (o con uno schema vecchio) Nautilus parte lo stesso con il
comportamento di serie. Le stringhe nuove hanno la traduzione italiana in `po/it.po`.

## Costruire

Serve l'SRPM di Fedora (sorgenti di Nautilus 51.1 e le due patch di Fedora, `default-terminal.patch` e
`CVE-2026-111802.patch`). Come utente, senza root:

```bash
dnf download --source nautilus-51.1-2.fc45
mkdir sorgenti && cd sorgenti && rpm2cpio ../nautilus-51.1-2.fc45.src.rpm | cpio -idm
cp ../*.patch ../nautilus.spec .           # le patch e lo spec di questa cartella
sudo dnf builddep ./nautilus.spec
rpmbuild -bb --define "_sourcedir $PWD" nautilus.spec
```

Le patch si applicano con `%autosetup -p1` a fuzz 0. Il ricostruttore automatico che rifà lo stesso quando Fedora
aggiorna Nautilus è nel pacchetto di integrazione, in [`../integrazione/`](../integrazione/).

`nautilus.spec` deriva dallo spec di Fedora: in più ha la release `.codlab`, le patch CodLab e lo schema
`org.gnome.nautilus.codlab.gschema.xml` fra i file. Il changelog ereditato da Fedora non è riportato qui: è quello
del pacchetto `nautilus-51.1-2.fc45`.

## Tornare al Nautilus di Fedora

```bash
sudo dnf distro-sync nautilus nautilus-extensions
```

Licenza: le patch derivano da Nautilus e sono GPL-3.0-or-later (vedi [LICENSE.md](../../LICENSE.md)).
