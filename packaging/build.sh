#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
set -eu
src=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
out=${1:-"$src/../dist"}
mkdir -p "$out"
out=$(CDPATH='' cd -- "$out" && pwd)
case "$out/" in "$src/"*) echo 'La cartella di uscita deve essere fuori dal repository' >&2; exit 1;; esac
if test -n "$(git -C "$src" status --porcelain --untracked-files=all)"; then
    echo 'Serve un checkout pulito e committato' >&2; exit 1
fi
for tool in python3 glib-compile-schemas rpmbuild dpkg-deb tar gzip sha256sum; do
    command -v "$tool" >/dev/null || { echo "Manca $tool" >&2; exit 1; }
done
export SOURCE_DATE_EPOCH=$(git -C "$src" show -s --format=%ct HEAD)
work=$(mktemp -d "${TMPDIR:-/tmp}/codlab-thema-build.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT HUP INT TERM
version=0.1.0
name=codlab-thema-$version
mkdir -p "$work/source/$name" "$work/rpm/SOURCES" "$work/rpm/SPECS"
# Solo sorgenti di codice e documentazione GPL, nessun resoconto o schermata CC.
git -C "$src" archive HEAD extensions nautilus packaging LICENSE LICENSES/GPL-3.0-or-later.txt .github/FUNDING.yml |
    tar -xf - -C "$work/source/$name"
# La guida nell'archivio è quella GPL dei pacchetti, senza il resoconto CC.
cp "$work/source/$name/packaging/README.md" "$work/source/$name/README.md"
cp "$work/source/$name/LICENSE" "$work/source/$name/LICENSE.md"
python3 "$work/source/$name/packaging/validate.py" --source "$work/source/$name"
tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner \
    -czf "$work/rpm/SOURCES/$name.tar.gz" -C "$work/source" "$name"
cp "$work/source/$name/packaging/rpm/codlab-thema.spec" "$work/rpm/SPECS/"
rpmbuild -bb --define "_topdir $work/rpm" --define '_buildhost reproducible' \
    --define 'dist .fc45' --define 'clamp_mtime_to_source_date_epoch 1' \
    --define 'use_source_date_epoch_as_buildtime 1' "$work/rpm/SPECS/codlab-thema.spec"
python3 "$work/source/$name/packaging/stage.py" "$work/deb"
python3 "$work/source/$name/packaging/validate.py" --root "$work/deb"
mkdir -p "$work/deb/DEBIAN"
cp "$work/source/$name/packaging/deb/control" "$work/deb/DEBIAN/control"
size=$(du -sk "$work/deb/usr" | cut -f1)
printf 'Installed-Size: %s\n' "$size" >> "$work/deb/DEBIAN/control"
(cd "$work/deb" && find usr -type f -print0 | LC_ALL=C sort -z | xargs -0 md5sum) > "$work/deb/DEBIAN/md5sums"
chmod 755 "$work/deb/DEBIAN"
chmod 644 "$work/deb/DEBIAN/"*
dpkg-deb --root-owner-group --build "$work/deb" "$work/codlab-thema_${version}-1_all.deb"
cp "$work/rpm/RPMS/noarch/"*.rpm "$work/codlab-thema_${version}-1_all.deb" "$work/rpm/SOURCES/$name.tar.gz" "$out/"
git -C "$src" rev-parse HEAD > "$out/COMMIT"
(cd "$out" && sha256sum ./*.rpm ./*.deb ./*.tar.gz COMMIT > SHA256SUMS)
echo "Artefatti: $out"
