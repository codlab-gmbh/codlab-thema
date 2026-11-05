# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
%global debug_package %{nil}
%global __os_install_post %{nil}
Name:           codlab-thema
Version:        0.1.0
Release:        1%{?dist}
Summary:        CodLab desktop extensions for GNOME Shell 51
License:        GPL-3.0-or-later
URL:            https://github.com/codlab-gmbh/codlab-thema
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch
Packager:       CodLab <info@codlab.de>
BuildRequires:  python3
BuildRequires:  glib2
Requires:       python3 >= 3.9
Requires:       python3-gobject-base
Requires:       gnome-shell >= 51
Requires:       gnome-shell < 52
Requires:       nautilus >= 51
Requires:       nautilus < 52
Requires:       nautilus-python >= 4.0
Requires:       gtk4 >= 4.24
Requires:       libadwaita
Requires:       glib2
Requires:       systemd

%description
Ten system extensions, symbolic icons and glass effects inside Files.
Activation is explicit for each desktop user with codlab-thema.
Supports GNOME Shell 51 and Nautilus 51 with GTK 4.24 and Wayland.
Nautilus binaries, reports and screenshots are excluded.

Free software by CodLab UG (haftungsbeschränkt).
Donations are welcome: https://www.paypal.com/paypalme/codlabUG

%prep
%setup -q

%build
python3 packaging/validate.py --source .

%install
python3 packaging/stage.py %{buildroot}

%check
python3 packaging/validate.py --source .
python3 packaging/validate.py --root %{buildroot}
python3 packaging/tests/vetro-consenso.py

%files
%license /usr/share/licenses/codlab-thema/LICENSE
%doc /usr/share/doc/codlab-thema/
/usr/bin/codlab-thema
/usr/libexec/codlab-thema/
/usr/lib/systemd/user/dock-fine-avvio-prima-della-shell.service
/usr/share/codlab-thema/
/usr/share/gnome-shell/extensions/*
/usr/share/nautilus-python/extensions/codlab-vetro.py
/usr/share/nautilus-python/extensions/codlab-vetro.css
/usr/share/man/man1/codlab-thema.1.gz

%changelog
* Thu Nov 05 2026 CodLab <info@codlab.de> - 0.1.0-1
- Pacchetto iniziale con attivazione esplicita per utente.
