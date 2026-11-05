// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Quiete delle aree (29.10.2026).
//
// Il difetto, nella Shell 51 (windowManager.js, WorkspaceTracker): a ogni cambio d'area «switch-workspace» mette in
// coda _checkWorkspaces come later BEFORE_REDRAW. Se gli aggiornamenti delle aree sono bloccati (lo fa il popup del
// cambio d'area da tastiera finché resta a schermo, ~600 ms + 100 ms di dissolvenza, e l'animazione del cambio),
// _checkWorkspaces risponde GLib.SOURCE_CONTINUE: il later resta in coda e Mutter, finché c'è un later, chiede un
// altro aggiornamento dello stage. Risultato misurato sulla Shell vera: entrambi i frame clock girano a vuoto
// (dispatch senza disegno) per tutto il tempo del popup, fino a ~2800 volte al secondo.
//
// La cura: mentre è bloccato, il controllo esce dalla coda e si segna come rinviato; allo sblocco si rimette in coda
// una volta sola. Stessa semantica (il controllo gira al primo fotogramma dopo lo sblocco), senza giri a vuoto.
// Si tocca soltanto l'ISTANZA Main.wm._workspaceTracker (nessun prototipo), e disable() rimette tutto com'era.
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class QuieteAree extends Extension {
    enable() {
        const tracker = Main.wm?._workspaceTracker;
        if (!tracker || typeof tracker._checkWorkspaces !== 'function' ||
            typeof tracker.unblockUpdates !== 'function' || typeof tracker._queueCheckWorkspaces !== 'function')
            return;
        this._tracker = tracker;
        const controlla = Object.getPrototypeOf(tracker)._checkWorkspaces;
        const sblocca = Object.getPrototypeOf(tracker).unblockUpdates;
        tracker._checkWorkspaces = function () {
            if (this._pauseWorkspaceCheck) {
                this._checkWorkspacesId = 0;
                this._quieteRinviato = true;
                return GLib.SOURCE_REMOVE;
            }
            return controlla.call(this);
        };
        tracker.unblockUpdates = function () {
            sblocca.call(this);
            if (this._quieteRinviato && !this._pauseWorkspaceCheck) {
                this._quieteRinviato = false;
                this._queueCheckWorkspaces();
            }
        };
        // _queueCheckWorkspaces lega this._checkWorkspaces al momento della messa in coda: un later già in coda
        // userebbe ancora la funzione vecchia. Lo si sostituisce con uno nuovo.
        if (tracker._checkWorkspacesId) {
            global.compositor.get_laters().remove(tracker._checkWorkspacesId);
            tracker._checkWorkspacesId = 0;
            tracker._queueCheckWorkspaces();
        }
    }

    disable() {
        const tracker = this._tracker;
        if (!tracker)
            return;
        const rinviato = tracker._quieteRinviato;
        delete tracker._checkWorkspaces;
        delete tracker.unblockUpdates;
        delete tracker._quieteRinviato;
        this._tracker = null;
        if (rinviato || tracker._checkWorkspacesId) {
            if (tracker._checkWorkspacesId)
                global.compositor.get_laters().remove(tracker._checkWorkspacesId);
            tracker._checkWorkspacesId = 0;
            tracker._queueCheckWorkspaces();
        }
    }
}
