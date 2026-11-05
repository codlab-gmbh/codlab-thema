# CodLab Thema — installazione

Copyright (C) 2026 CodLab UG (haftungsbeschränkt). Codice e questa documentazione:
GPL-3.0-or-later; il testo completo è incluso. English: system extensions for
GNOME Shell 51 with explicit activation for each desktop user.

Sono incluse dieci estensioni di GNOME Shell 51 e il vetro in File (Nautilus 51,
nautilus-python, GTK 4.24, Wayland). GNOME Shell 52 e le versioni precedenti alla
51 non sono supportate. Il vetro resta spento dove manca la sfocatura reale e
con il contrasto elevato. La serie di patch di Nautilus resta un sorgente
separato: questo pacchetto non contiene né sostituisce il binario di Nautilus.

Dopo l'installazione, come utente del desktop:

```
codlab-thema attiva
codlab-thema stato
codlab-thema disattiva
```

Le estensioni di sistema nuove sono riconosciute al prossimo accesso. Il vetro
in File segue l'attivazione per utente; se File era già aperto durante la prima
installazione, caricherà l'estensione alla prossima partenza. L'installazione
non cambia le impostazioni delle persone e non avvia servizi. Il servizio del
dock si abilita soltanto con `attiva`, per il prossimo accesso, senza avviarlo.

Prima di rimuovere il pacchetto eseguire `codlab-thema disattiva` come utente.
La rimozione non cancella preferenze personali: le estensioni di terzi sono
preservate. Le copie delle stesse estensioni installate nella casa personale
hanno precedenza: `attiva` le segnala e si ferma senza modificarle.

Dash to Dock è necessario per Dock dal bordo e Rimbalzo; senza di esso le altre
estensioni funzionano. L'integrazione AppIndicator del Vassoio è facoltativa.
Con Blur my Shell, disabilitare i suoi effetti su pannello, dock e menu se si
usa Vetro. Il comando non sovrascrive queste preferenze di terzi.

CodLab Thema è libero e gratuito. Una donazione è gradita:
https://www.paypal.com/paypalme/codlabUG
English: if you find it useful, donations are welcome. Thank you!

## Costruzione dal sorgente

Servono Git, Python 3, glib-compile-schemas, tar, gzip, rpmbuild e dpkg-deb.
Da un checkout pulito: `packaging/build.sh /percorso/esterno/dist`.
Lo script valida i sorgenti, prepara un archivio del commit senza resoconti o
schermate, esegue rpmbuild (compreso %check) e dpkg-deb senza root. Registra
commit, versione e checksum. Non scarica dipendenze e non installa nulla.
