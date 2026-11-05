#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""Valida sorgenti o payload installato; qualsiasi difetto causa uscita non zero."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


def require(condition, message):
    if not condition:
        raise ValueError(message)


def extension(folder, uuid):
    require(folder.is_dir(), f'estensione assente: {uuid}')
    metadata = json.loads((folder / 'metadata.json').read_text())
    require(metadata['uuid'] == uuid, f'UUID: {uuid}')
    require(metadata['shell-version'] == ['51'], f'Shell supportata: {uuid}')
    require(metadata['license'] == 'GPL-3.0-or-later', f'licenza: {uuid}')
    require(isinstance(metadata['version'], int) and metadata['version'] > 0, f'versione: {uuid}')
    require(bool(metadata['name']) and bool(metadata['description']), f'descrizione: {uuid}')
    require((folder / 'extension.js').is_file(), f'extension.js assente: {uuid}')
    for schema in folder.glob('schemas/*.gschema.xml'):
        ET.parse(schema)
        require(schema.with_name('gschemas.compiled').is_file(), f'schema non compilato: {uuid}')
        with tempfile.TemporaryDirectory(prefix='codlab-schema-') as tmp:
            subprocess.run(['glib-compile-schemas', '--strict', '--targetdir', tmp, str(schema.parent)], check=True)
            require((Path(tmp) / 'gschemas.compiled').read_bytes() == schema.with_name('gschemas.compiled').read_bytes(),
                    f'schema compilato diverso: {uuid}')


def source(root):
    config = json.loads((root / 'packaging/extensions.json').read_text())
    folders = config['extensions']
    require(len(folders) == 10 and len(set(folders)) == 10, 'elenco delle dieci estensioni')
    for folder in folders:
        extension(root / folder, Path(folder).name)
    for patch in (root / 'nautilus/codlab').glob('*.patch'):
        subprocess.run(['git', 'apply', '--numstat', str(patch.resolve())], check=True, capture_output=True)
    require('https://www.paypal.com/paypalme/codlabUG' in (root / 'packaging/README.md').read_text(), 'link donazioni')
    require((root / '.github/FUNDING.yml').read_text().strip() ==
            'custom: ["https://www.paypal.com/paypalme/codlabUG"]', 'link FUNDING')


def payload(root):
    data = root / 'usr/share/codlab-thema'
    manifest = json.loads((data / 'manifest.json').read_text())
    uuids = json.loads((data / 'extensions.json').read_text())
    require(len(uuids) == 10 and len(set(uuids)) == 10, 'elenco payload')
    for uuid in uuids:
        extension(root / 'usr/share/gnome-shell/extensions' / uuid, uuid)
    for name, digest in manifest.items():
        path = root / name
        require(path.is_file() and not path.is_symlink(), f'file assente: {name}')
        require(hashlib.sha256(path.read_bytes()).hexdigest() == digest, f'impronta diversa: {name}')
    require('usr/bin/codlab-thema' in manifest, 'comando assente dal manifesto')
    require('usr/share/nautilus-python/extensions/codlab-vetro.py' in manifest, 'vetro assente dal manifesto')
    require(not list(root.rglob('docs/img')), 'schermate nel payload')
    require(not list(root.glob('home/*')), 'file nelle case degli utenti')
    require(not list(root.glob('etc/*')), 'configurazione di sistema inattesa')
    readme = (root / 'usr/share/doc/codlab-thema/README.md').read_text()
    require(readme.count('https://www.paypal.com/paypalme/codlabUG') == 1, 'link donazioni payload')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--source', type=Path)
    group.add_argument('--root', type=Path)
    args = parser.parse_args()
    try:
        source(args.source) if args.source else payload(args.root)
        print('VERDE: metadata, file, schemi compilati, licenze e donazioni')
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f'ROSSO: {error}', file=sys.stderr)
        sys.exit(1)
