// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Solo operazioni esplicite sul centro notifiche della sessione corrente.
// Nessuna valutazione di codice ricevuto dal bus, nessun contenuto dei messaggi.
const IFACE = `<node><interface name="org.codlab.Notifiche">
  <method name="Elenco"><arg type="s" direction="out"/></method>
  <method name="Cancella"><arg type="s" direction="in"/><arg type="b" direction="out"/></method>
  <method name="Centro"><arg type="b" direction="in"/><arg type="b" direction="out"/></method>
</interface></node>`;

export default class CentroNotifiche extends Extension {
    enable() {
        this._sessione = GLib.uuid_string_random();
        this._numeri = new WeakMap();
        this._prossimo = 0;
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/org/codlab/Notifiche');
    }

    disable() {
        this._dbus?.unexport();
        this._dbus = null;
        this._numeri = null;
    }

    _attuali() {
        const rows = [];
        for (const source of Main.messageTray.getSources()) {
            for (const notification of [...source.notifications]) {
                if (!this._numeri.has(notification))
                    this._numeri.set(notification, `${this._sessione}:${++this._prossimo}`);
                rows.push({
                    id: this._numeri.get(notification),
                    origine: source.title ?? 'GNOME',
                    titolo: notification.title ?? '',
                    creato: notification.datetime?.to_unix() ?? 0,
                    oggetto: notification,
                });
            }
        }
        return rows;
    }

    Elenco() {
        return JSON.stringify(this._attuali().map(({oggetto, ...row}) => row));
    }

    Cancella(id) {
        const row = this._attuali().find(n => n.id === id);
        if (!row)
            return false;
        row.oggetto.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
        return true;
    }

    Centro(apri) {
        const menu = Main.panel.statusArea.dateMenu.menu;
        const prima = menu.isOpen;
        if (apri)
            menu.open();
        else
            menu.close();
        return prima;
    }
}
