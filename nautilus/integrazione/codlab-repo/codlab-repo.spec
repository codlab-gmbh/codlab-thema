Name:           codlab-repo
Version:        20261102
Release:        1
Summary:        Repo locale «codlab» ed esclusione dei nomi CodLab dai repo di Fedora
License:        GPL-3.0-or-later
BuildArch:      noarch
Source0:        codlab.repo
Source1:        80-codlab-esclusioni.repo

%description
Il repo locale «codlab» (/var/lib/codlab-rpm/repo, file://) e' la fonte unica dei
pacchetti che CodLab costruisce sulla macchina: nautilus e nautilus-extensions con
le patch CodLab, nautilus-codlab-integrazione, domani CodLab Thema. I repo binari
di Fedora (fedora, updates, updates-testing) non offrono piu' i nomi che CodLab
ricostruisce (/etc/dnf/repos.override.d/80-codlab-esclusioni.repo): nessun
cliente di libdnf5 (dnf5, aggiornamento offline, GNOME Software, PackageKit) puo'
sostituire il nostro con quello di Fedora. I repo -source restano intatti: da li'
codlab-nautilus-ricostruisci prende gli SRPM.

%prep

%build

%install
install -D -m 0644 %{SOURCE0} %{buildroot}/etc/yum.repos.d/codlab.repo
install -D -m 0644 %{SOURCE1} %{buildroot}/etc/dnf/repos.override.d/80-codlab-esclusioni.repo
install -d -m 0755 %{buildroot}/var/lib/codlab-rpm/repo

%check
grep -q '^baseurl=file:///var/lib/codlab-rpm/repo$' %{buildroot}/etc/yum.repos.d/codlab.repo
for r in fedora updates updates-testing; do
  awk -v r="[$r]" '$0==r{s=1;next} /^\[/{s=0} s && /^excludepkgs=/{print}' \
      %{buildroot}/etc/dnf/repos.override.d/80-codlab-esclusioni.repo | grep -q 'nautilus,nautilus-extensions'
done
! grep -qE '^\[[a-z-]*source\]' %{buildroot}/etc/dnf/repos.override.d/80-codlab-esclusioni.repo

%files
%config(noreplace) /etc/yum.repos.d/codlab.repo
# l'elenco dei nomi esclusi segue i pacchetti CodLab: un aggiornamento lo SOSTITUISCE (non noreplace)
%config /etc/dnf/repos.override.d/80-codlab-esclusioni.repo
%dir /var/lib/codlab-rpm
%dir /var/lib/codlab-rpm/repo

%changelog
* Mon Nov 02 2026 CodLab - 20261102-1
- primo rilascio: repo locale codlab + esclusione mirata di nautilus,
  nautilus-extensions, nautilus-devel dai repo binari di Fedora
