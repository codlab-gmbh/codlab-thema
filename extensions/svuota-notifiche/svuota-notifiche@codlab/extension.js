// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// GNOME 51: osserva soltanto i contenitori. Nessuna sostituzione di metodi,
// nessun cambiamento delle azioni delle applicazioni o delle loro notifiche.
export default class SvuotaNotifiche extends Extension {
    enable() {
        this._connections = new Map();
        this._buttons = new Map();
        this._pending = 0;
        this._busy = false;
        try {
            this._view = Main.panel.statusArea.dateMenu._messageList._messageView;
            const banners = Main.messageTray._bannerBin;
            if (typeof this._view?.clear !== 'function' || !banners)
                throw new Error('Contenitori notifiche GNOME 51 non riconosciuti');
            this._watch(banners);
            this._watch(this._view);
            this._scan(banners);
            this._scan(this._view);
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _guard(callback) {
        try {
            callback();
        } catch (error) {
            console.error(`[svuota-notifiche] ${error.stack ?? error}`);
        }
    }

    _watch(actor) {
        if (this._connections.has(actor))
            return;
        const added = actor.connect('child-added', (_parent, child) => {
            this._guard(() => this._scan(child));
        });
        const destroyed = actor.connect('destroy', () => {
            this._connections.delete(actor);
        });
        this._connections.set(actor, [added, destroyed]);
    }

    _scan(actor, depth = 0) {
        if (actor instanceof MessageList.NotificationMessage) {
            this._attach(actor);
            return;
        }
        if (actor instanceof MessageList.NotificationMessageGroup)
            this._watch(actor);
        if (depth < 4) {
            for (const child of actor.get_children())
                this._scan(child, depth + 1);
        }
    }

    _attach(message) {
        if (this._buttons.has(message))
            return;
        const header = message._header;
        if (!header?.closeButton || header.closeButton.get_parent() !== header)
            throw new Error('Intestazione della notifica non riconosciuta');
        const button = new St.Button({
            label: 'Svuota tutto',
            accessible_name: 'Svuota tutto',
            style_class: 'button svuota-notifiche-button',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', () => this._guard(() => this._clear()));
        const destroyed = message.connect('destroy', () => {
            this._buttons.delete(message);
        });
        this._buttons.set(message, {button, destroyed});
        header.insert_child_below(button, header.closeButton);
    }

    _clear() {
        if (this._busy)
            return;
        this._busy = true;
        // Lo stesso metodo invocato dal pulsante Cancella del calendario.
        try {
            this._view.clear();
        } catch (error) {
            this._busy = false;
            throw error;
        }
        // Attende le animazioni native prima del comando che chiude anche le
        // eventuali sorgenti arrivate nel frattempo e archivia la nostra coda.
        this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            this._pending = 0;
            try {
                const command = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'notifiche']);
                const process = Gio.Subprocess.new(
                    ['/usr/bin/timeout', '--signal=TERM', '--kill-after=2', '45', command, 'cancella', '--tutte'],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
                process.communicate_utf8_async(null, null, (child, result) => {
                    this._busy = false;
                    this._guard(() => {
                        const [, , stderr] = child.communicate_utf8_finish(result);
                        if (!child.get_successful())
                            throw new Error(`Coda non svuotata: ${stderr.trim()}`);
                    });
                });
            } catch (error) {
                this._busy = false;
                this._guard(() => { throw error; });
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._pending)
            GLib.Source.remove(this._pending);
        this._pending = 0;
        for (const [actor, ids] of this._connections ?? [])
            this._guard(() => ids.forEach(id => actor.disconnect(id)));
        this._connections?.clear();
        for (const [message, {button, destroyed}] of this._buttons ?? []) {
            this._guard(() => message.disconnect(destroyed));
            this._guard(() => button.destroy());
        }
        this._buttons?.clear();
        this._view = null;
        this._busy = false;
    }
}
