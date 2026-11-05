# Integrazione di Nautilus CodLab — `nautilus-codlab-integrazione` e `codlab-repo`

*English: the tools around the patched Nautilus — an automatic rebuilder that re-applies the CodLab patch series on top
of every new Fedora Nautilus and publishes it to a local repository, the repository package itself, a RAW thumbnailer
and photo columns for the list view.*

| File | Che cosa fa |
|---|---|
| `codlab-nautilus-ricostruisci` | ricostruisce il Nautilus CodLab **a monte** di Fedora: guarda il nautilus più nuovo nei repo *sorgente* di Fedora e, se è più nuovo della nostra base, applica la serie (`serie.json`), costruisce con rpmbuild come utente normale, prova il risultato a secco (Xvfb e bus di sessione privati) e lo pubblica nel repo locale «codlab» con createrepo_c. Non installa niente a caldo: lo porta il prossimo aggiornamento. Se una patch non si applica o la prova è rossa resta la build di prima, e arriva un avviso. Sottocomandi: `controlla`, `prepara-spec`, `costruisci`, `prova`, `pubblica`, `automatico` |
| `nautilus-barra-aggiorna`, `systemd/nautilus-barra.{service,timer}` | il timer di sistema (5 minuti dopo l'avvio e una volta al giorno) che lancia `codlab-nautilus-ricostruisci automatico` |
| `codlab-repo/` | il pacchetto che configura il repo locale «codlab» (`/var/lib/codlab-rpm/repo`) e toglie `nautilus`, `nautilus-extensions` e `nautilus-devel` dai repo *binari* di Fedora (`repos.override.d`), così nessun client di libdnf5 (dnf5, aggiornamento offline, GNOME Software, PackageKit) rimette il Nautilus di Fedora al posto del nostro |
| `nautilus-raw-anteprima`, `raw.thumbnailer` | anteprime delle foto RAW dal JPEG incorporato (exiv2 e ImageMagick) |
| `colonne-foto.py` | estensione nautilus-python: colonne «Dimensioni», «Scatto» e «Fotocamera» per le foto nella vista a elenco |
| `nautilus-codlab-integrazione.spec` | il pacchetto che installa tutto questo, e la serie di patch di [`../codlab/`](../codlab/), sotto `/usr/local` |

Da root la costruzione gira come il primo utente normale (uid 1000): `CODLAB_UTENTE` ne sceglie un altro. Le cartelle
di lavoro, il repo e il file di stato si cambiano con le variabili `CODLAB_*` in testa allo script.

Requisiti: Fedora 45 (dnf5), `rpm-build`, `createrepo_c`, `python3-rpm`, `cpio`, `xorg-x11-server-Xvfb`,
`dbus-daemon`; per le anteprime RAW exiv2 e ImageMagick; per le colonne `nautilus-python`.

## Costruire e installare

```bash
mkdir sorgenti
cp ../codlab/*.patch ../codlab/serie.json nautilus-barra-aggiorna codlab-nautilus-ricostruisci \
   nautilus-raw-anteprima raw.thumbnailer colonne-foto.py sorgenti/
rpmbuild -bb --define "_sourcedir $PWD/sorgenti" nautilus-codlab-integrazione.spec
rpmbuild -bb --define "_sourcedir $PWD/codlab-repo" codlab-repo/codlab-repo.spec
sudo dnf install ~/rpmbuild/RPMS/noarch/codlab-repo-*.rpm ~/rpmbuild/RPMS/noarch/nautilus-codlab-integrazione-*.rpm
sudo install -m 644 systemd/nautilus-barra.service systemd/nautilus-barra.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nautilus-barra.timer
```

## Togliere

```bash
sudo systemctl disable --now nautilus-barra.timer
sudo rm /etc/systemd/system/nautilus-barra.service /etc/systemd/system/nautilus-barra.timer
sudo systemctl daemon-reload
sudo dnf remove nautilus-codlab-integrazione codlab-repo
sudo dnf distro-sync nautilus nautilus-extensions      # torna il Nautilus di Fedora
```

Licenza: GPL-3.0-or-later (vedi [LICENSE.md](../../LICENSE.md)).
