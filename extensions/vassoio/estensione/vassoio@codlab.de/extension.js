// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Vassoio (04.11.2026): l'area delle icone di stato della barra. Tre pezzi indipendenti, creati in enable e tolti in
// disable: le icone a filo (uniforma.js), l'ordine/posto/doppioni con il menu ⌄ (vassoio.js), il testimone di Mochi
// (testimone.js). Disabilitandola la barra torna com'era: contenitori rimostrati, icone dei proprietari, menu
// riancorati ai loro pulsanti.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Testimone} from './testimone.js';
import {Uniforma} from './uniforma.js';
import {Vassoio} from './vassoio.js';

export default class VassoioEstensione extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._uniforma = new Uniforma(this.path, this._settings);
        this._vassoio = new Vassoio(this, this._settings, this._uniforma);
        this._testimone = new Testimone(this._settings);
    }

    disable() {
        this._testimone?.destroy();
        this._testimone = null;
        this._vassoio?.destroy();
        this._vassoio = null;
        this._uniforma?.destroy();
        this._uniforma = null;
        this._settings = null;
    }
}
