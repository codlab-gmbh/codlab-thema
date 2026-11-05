// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Preferenze del vassoio: l'elenco delle icone viste, da sinistra a destra, con ↑ ↓ per l'ordine e l'interruttore
// «In barra» (spento = nel menu ⌄, raggiungibile col suo menu). Tutto vale a caldo, senza uscire dalla sessione.
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function elenco(settings) {
    const viste = settings.get_value('visti').deep_unpack();
    const ordine = settings.get_strv('ordine').filter(k => k in viste);
    // come nella barra: le icone nuove (non ancora in «ordine») a sinistra
    return [...Object.keys(viste).filter(k => !ordine.includes(k)), ...ordine];
}

export default class VassoioPreferenze extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._vassoioSettings = settings;
        const pagina = new Adw.PreferencesPage({title: 'Vassoio', icon_name: 'view-grid-symbolic'});
        const icone = new Adw.PreferencesGroup({
            title: 'Icone della barra',
            description: 'Da sinistra a destra. «In barra» spento: l\'icona va nel menu ⌄ e resta raggiungibile, con il suo menu.',
        });
        const aspetto = new Adw.PreferencesGroup({title: 'Aspetto'});
        for (const [chiave, titolo, sotto] of [
            ['uniforma', 'Icone a filo', 'Tiling Shell, Google Drive e Cardinal Host con icone simboliche come quelle di sistema; lo stato resta nel glifo.'],
            ['doppioni', 'Togli i doppioni', 'Lo stesso elemento registrato due volte compare una volta sola.'],
            ['testimone-mochi', 'Testimone di Mochi', 'Annota se Mochi resta fuori dalla panoramica (non cambia niente).'],
        ]) {
            const riga = new Adw.SwitchRow({title: titolo, subtitle: sotto});
            settings.bind(chiave, riga, 'active', Gio.SettingsBindFlags.DEFAULT);
            aspetto.add(riga);
        }
        pagina.add(icone);
        pagina.add(aspetto);
        window.add(pagina);

        let righe = [];
        const ricostruisci = () => {
            for (const r of righe)
                icone.remove(r);
            righe = [];
            const viste = settings.get_value('visti').deep_unpack();
            const chiavi = elenco(settings);
            const nelMenu = new Set(settings.get_strv('nel-menu'));
            const posti = settings.get_value('posti').deep_unpack();
            chiavi.forEach((chiave, i) => {
                const daSe = posti[chiave] === 'menu-da-sé' || posti[chiave] === 'nascosta-da-sé';
                const riga = new Adw.ActionRow({title: viste[chiave] ?? chiave,
                    subtitle: daSe ? 'Nascosta da sé (impostazione sua): resta nel menu ⌄, con il suo menu' : chiave});
                for (const [icona, verso, descr] of [['go-up-symbolic', -1, 'Più a sinistra'], ['go-down-symbolic', 1, 'Più a destra']]) {
                    const b = new Gtk.Button({icon_name: icona, valign: Gtk.Align.CENTER, tooltip_text: descr,
                        sensitive: i + verso >= 0 && i + verso < chiavi.length});
                    b.add_css_class('flat');
                    b.connect('clicked', () => {
                        const nuovo = [...chiavi];
                        [nuovo[i], nuovo[i + verso]] = [nuovo[i + verso], nuovo[i]];
                        settings.set_strv('ordine', nuovo);
                    });
                    riga.add_suffix(b);
                }
                const inBarra = new Gtk.Switch({active: !nelMenu.has(chiave) && !daSe, valign: Gtk.Align.CENTER,
                    sensitive: !daSe, tooltip_text: daSe ? 'Si nasconde da sé: la si mostra dalle sue impostazioni'
                        : 'In barra (spento: nel menu ⌄)'});
                inBarra.connect('notify::active', () => {
                    const s = new Set(settings.get_strv('nel-menu'));
                    if (inBarra.active)
                        s.delete(chiave);
                    else
                        s.add(chiave);
                    settings.set_strv('nel-menu', [...s]);
                });
                riga.add_suffix(inBarra);
                riga.activatable_widget = inBarra;
                icone.add(riga);
                righe.push(riga);
            });
        };
        // a giro finito: l'interruttore che ha cambiato la chiave non si distrugge dentro il suo segnale
        let idle = 0;
        const programma = () => {
            if (!idle) {
                idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    idle = 0;
                    ricostruisci();
                    return GLib.SOURCE_REMOVE;
                });
            }
        };
        const ids = ['visti', 'posti', 'ordine', 'nel-menu'].map(chiave => settings.connect(`changed::${chiave}`, programma));
        window.connect('close-request', () => {
            ids.forEach(id => settings.disconnect(id));
            if (idle)
                GLib.source_remove(idle);
            idle = 0;
            return false;
        });
        ricostruisci();
    }
}
