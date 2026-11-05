# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
%{!?con_gruppi:%global con_gruppi 1}
%{!?codlab_release:%global codlab_release 1}
Name:           nautilus-codlab-integrazione
Version:        20261104
Release:        %{codlab_release}
Summary:        Ricostruzione automatica e strumenti «Nautilus potente» CodLab
License:        GPL-3.0-or-later
BuildArch:      noarch
Source0:        nautilus-barra-aggiorna
Source1:        barra-conteggio-elementi.patch
Source2:        icona-segnalibri.patch
%if %{con_gruppi}
Source3:        blocchi-barra.patch
Source4:        estetica-barra.patch
Source5:        ricerca-solo-qui.patch
Source6:        riquadro-dettagli.patch
Source7:        nautilus-raw-anteprima
Source8:        raw.thumbnailer
Source9:        colonne-foto.py
Source10:       raggruppa-per.patch
Source13:       configura-barra.patch
%endif
Source11:       codlab-nautilus-ricostruisci
Source12:       serie.json
# la ricostruzione a monte: legge i repo sorgente di Fedora, costruisce, prova, pubblica nel repo codlab
Requires:       codlab-repo
Requires:       createrepo_c
Requires:       python3-rpm
Requires:       rpm-build
Requires:       cpio
# la prova a secco del binario costruito: Xvfb e bus di sessione privati
Requires:       xorg-x11-server-Xvfb
Requires:       dbus-daemon

%description
Installa lo script di ricostruzione, le patch e gli strumenti di
«Nautilus potente»: ricerca «solo qui» nel popover di ricerca,
anteprime RAW dal JPEG incorporato (exiv2 + ImageMagick, gia' presenti),
colonne foto (Dimensioni, Scatto, Fotocamera) per la vista a elenco,
raggruppa per della vista a elenco (incremento 3, 01.11.2026),
finestra «Configura i gruppi» della barra laterale (INC-4a, dal 20261103:
serie.json e configura-barra.patch, cosi' la ricostruzione automatica porta
INC-4a anche sulle versioni nuove di Fedora; dalla 20261103-2 codlab_rel 3,
senza «Cambia icona» e «Sposta», spenti per INC-4b; dalla 20261104-1
codlab_rel 4: barra.ini caricato per intero e scritto sul posto, le
scritture che perderebbero dati rifiutate).
Dal 20261102: codlab-nautilus-ricostruisci ricostruisce le patch (serie.json) a monte
di Fedora e pubblica nel repo locale «codlab» (pacchetto codlab-repo), senza
installare a caldo; nautilus-barra-aggiorna ne e' solo l'ingresso storico.
Non avvia servizi e non chiude finestre. La revisione di ritorno ripristina
lo script precedente e le due patch senza gruppi.

%prep

%build

%install
install -D -m 0755 %{SOURCE0} %{buildroot}/usr/local/bin/nautilus-barra-aggiorna
install -D -m 0755 %{SOURCE11} %{buildroot}/usr/local/bin/codlab-nautilus-ricostruisci
install -D -m 0644 %{SOURCE12} %{buildroot}/usr/local/share/nautilus-barra/serie.json
install -D -m 0644 %{SOURCE1} %{buildroot}/usr/local/share/nautilus-barra/barra-conteggio-elementi.patch
install -D -m 0644 %{SOURCE2} %{buildroot}/usr/local/share/nautilus-barra/icona-segnalibri.patch
%if %{con_gruppi}
install -D -m 0644 %{SOURCE3} %{buildroot}/usr/local/share/nautilus-barra/blocchi-barra.patch
install -D -m 0644 %{SOURCE4} %{buildroot}/usr/local/share/nautilus-barra/estetica-barra.patch
install -D -m 0644 %{SOURCE5} %{buildroot}/usr/local/share/nautilus-barra/ricerca-solo-qui.patch
install -D -m 0644 %{SOURCE6} %{buildroot}/usr/local/share/nautilus-barra/riquadro-dettagli.patch
install -D -m 0644 %{SOURCE10} %{buildroot}/usr/local/share/nautilus-barra/raggruppa-per.patch
install -D -m 0644 %{SOURCE13} %{buildroot}/usr/local/share/nautilus-barra/configura-barra.patch
%endif
# «nautilus potente» (31.10.2026)
%if %{con_gruppi}
install -D -m 0755 %{SOURCE7} %{buildroot}/usr/local/bin/nautilus-raw-anteprima
install -D -m 0644 %{SOURCE8} %{buildroot}/usr/local/share/thumbnailers/raw.thumbnailer
# colonne-foto: a livello SISTEMA, cosi' valgono per tutti gli utenti senza
# toccare le estensioni in ~/.local (che restano dov'erano)
install -D -m 0644 %{SOURCE9} %{buildroot}/usr/local/share/nautilus-python/extensions/colonne-foto.py
%endif

%check
bash -n %{buildroot}/usr/local/bin/nautilus-barra-aggiorna
python3 -m py_compile %{buildroot}/usr/local/bin/codlab-nautilus-ricostruisci
# ogni patch della serie dev'essere nel pacchetto: la ricostruzione automatica le prende da qui
/usr/bin/python3 - <<'PY'
import json, os
d = "%{buildroot}/usr/local/share/nautilus-barra"
s = json.load(open(os.path.join(d, "serie.json")))
mancanti = [p for p in s["patch"] if not os.path.isfile(os.path.join(d, p))]
assert not mancanti, "patch della serie non spedite: %s" % mancanti
assert str(s["codlab_rel"]).isdigit() and s["marcatori"], "serie.json incompleta"
print("serie %s: %d patch presenti" % (s["serie"], len(s["patch"])))
PY
%if %{con_gruppi}
python3 -m py_compile %{buildroot}/usr/local/bin/nautilus-raw-anteprima
python3 -m py_compile %{buildroot}/usr/local/share/nautilus-python/extensions/colonne-foto.py
# la dichiarazione dei tipi MIME del thumbnailer dev'essere un INI leggibile
# (RawConfigParser: gli %i %o %s dell'Exec SONO letterali, non interpolazioni)
/usr/bin/python3 - <<'PY'
import configparser, pathlib
c = configparser.RawConfigParser()
c.read(pathlib.Path("%{buildroot}/usr/local/share/thumbnailers/raw.thumbnailer"))
assert c.has_section("Thumbnailer Entry")
se = c["Thumbnailer Entry"]
assert se.get("Type").strip() == "Thumbnailer"
assert "nautilus-raw-anteprima" in se.get("Exec") and "%i" in se.get("Exec") and "%o" in se.get("Exec")
assert len(se.get("MimeType").split(";")) >= 15, "troppi pochi tipi RAW dichiarati"
print("thumbnailer INI valido")
PY
%endif

%files
/usr/local/bin/nautilus-barra-aggiorna
/usr/local/bin/codlab-nautilus-ricostruisci
/usr/local/share/nautilus-barra/serie.json
/usr/local/share/nautilus-barra/barra-conteggio-elementi.patch
/usr/local/share/nautilus-barra/icona-segnalibri.patch
%if %{con_gruppi}
/usr/local/share/nautilus-barra/blocchi-barra.patch
/usr/local/share/nautilus-barra/estetica-barra.patch
/usr/local/share/nautilus-barra/ricerca-solo-qui.patch
/usr/local/share/nautilus-barra/riquadro-dettagli.patch
/usr/local/share/nautilus-barra/raggruppa-per.patch
/usr/local/share/nautilus-barra/configura-barra.patch
/usr/local/bin/nautilus-raw-anteprima
/usr/local/share/thumbnailers/raw.thumbnailer
/usr/local/share/nautilus-python/extensions/colonne-foto.py
%endif
# il .pyc compilato in %check non si spedisce (lo rigenera il primo avvio)
%exclude /usr/local/bin/__pycache__/*
%exclude /usr/local/share/nautilus-python/extensions/__pycache__/*
