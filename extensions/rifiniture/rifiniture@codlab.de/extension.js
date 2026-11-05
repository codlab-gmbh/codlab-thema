// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Rifiniture (30.10.2026): niente codice, solo stylesheet.css.
// Il foglio di un'estensione entra nel tema come foglio «personalizzato» e vince sui fogli delle estensioni a parità
// di !important con una specificità più alta; il foglio del tema utente (Colloid) invece perde contro Blur my Shell
// (provato nella Shell isolata il 30.10: con le stesse regole nel tema il riempimento restava #3584e4).
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class Rifiniture extends Extension {
    enable() {}

    disable() {}
}
