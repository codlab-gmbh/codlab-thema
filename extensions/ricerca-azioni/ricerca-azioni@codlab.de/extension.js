// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Recenti e azioni (29.10.2026).
//
// Quello che Spotlight fa e la ricerca della panoramica di GNOME 51 no, tutto in locale (nessuna rete):
//   - azioni rapide: «non disturbare» (banner delle notifiche), «luce notturna», «timer 5» / «timer 90 s» / «timer 1 ora»
//   - conversioni coi nomi italiani: «10 km in miglia», «100 f in c», «2 libbre in kg», «5 gib in gb»
//   - emoji coi nomi italiani: «cuore», «pollice», «fuoco» (Invio copia il carattere)
//   - file recenti: «recenti», oppure parole del nome di un file usato di recente (recently-used.xbel)
// Perché un'estensione e non un provider D-Bus: la Shell 51 legge i provider SOLO dalle cartelle di sistema
// (remoteSearch.js: collectFromDatadirs('search-providers', false)) e vuole un lanciatore visibile in griglia.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GioUnix from 'gi://GioUnix';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// ------------------------------------------------------------------ conversioni
const UNITA = new Map();
const SIMBOLI = {kb: 'kB', mb: 'MB', gb: 'GB', tb: 'TB', kib: 'KiB', mib: 'MiB', gib: 'GiB', tib: 'TiB', m2: 'm²'};
for (const [gruppo, fattore, ...nomi] of [
    ['lunghezza', 1000, 'km', 'chilometri', 'chilometro'], ['lunghezza', 1, 'm', 'metri', 'metro'],
    ['lunghezza', 0.01, 'cm', 'centimetri', 'centimetro'], ['lunghezza', 0.001, 'mm', 'millimetri', 'millimetro'],
    ['lunghezza', 1609.344, 'miglia', 'miglio', 'mi', 'mile', 'miles'], ['lunghezza', 0.3048, 'piedi', 'piede', 'ft', 'feet'],
    ['lunghezza', 0.0254, 'pollici', 'pollice', 'inch', 'inches'], ['lunghezza', 0.9144, 'iarde', 'iarda', 'yd', 'yard'],
    ['massa', 1, 'kg', 'chili', 'chilo', 'chilogrammi'], ['massa', 0.001, 'g', 'grammi', 'grammo'],
    ['massa', 1e-6, 'mg', 'milligrammi'], ['massa', 1000, 't', 'tonnellate', 'tonnellata'],
    ['massa', 0.45359237, 'libbre', 'libbra', 'lb', 'lbs'], ['massa', 0.028349523125, 'once', 'oncia', 'oz'],
    ['volume', 1, 'l', 'litri', 'litro'], ['volume', 0.001, 'ml', 'millilitri'], ['volume', 0.01, 'cl', 'centilitri'],
    ['volume', 3.785411784, 'galloni', 'gallone', 'gal'], ['volume', 0.473176473, 'pinte', 'pinta', 'pt'],
    ['velocità', 1 / 3.6, 'km/h', 'kmh'], ['velocità', 0.44704, 'mph'], ['velocità', 1, 'm/s'],
    ['velocità', 0.514444, 'nodi', 'nodo', 'kn'],
    ['dati', 1, 'byte', 'b'], ['dati', 1e3, 'kb'], ['dati', 1e6, 'mb'], ['dati', 1e9, 'gb'], ['dati', 1e12, 'tb'],
    ['dati', 1024, 'kib'], ['dati', 1024 ** 2, 'mib'], ['dati', 1024 ** 3, 'gib'], ['dati', 1024 ** 4, 'tib'],
    ['superficie', 1, 'm2', 'm²'], ['superficie', 1e4, 'ettari', 'ettaro', 'ha'], ['superficie', 4046.8564224, 'acri', 'acro'],
]) {
    for (const n of nomi)
        UNITA.set(n, [gruppo, fattore, SIMBOLI[nomi[0]] ?? nomi[0]]);
}
const TEMPERATURE = {c: 'C', '°c': 'C', celsius: 'C', f: 'F', '°f': 'F', fahrenheit: 'F', k: 'K', kelvin: 'K'};
const SIMBOLO_T = {C: '°C', F: '°F', K: 'K'};

function numero(s) {
    s = s.replace(/\s/g, '');
    s = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
}

function fmt(v) {
    if (v === 0 || !Number.isFinite(v))
        return String(v);
    const cifre = Math.max(0, Math.min(6, 4 - Math.floor(Math.log10(Math.abs(v)))));
    return v.toLocaleString('it-IT', {maximumFractionDigits: cifre});
}

function converti(testo) {
    const m = /^\s*(-?[\d.,]+)\s*([^\d\s]\S*)\s+(?:in|a|to|->|→|=)\s+(.+?)\s*$/.exec(testo.toLowerCase());
    if (!m)
        return null;
    const v = numero(m[1]);
    if (v === null)
        return null;
    const da = m[2].trim(), a = m[3].trim();
    if (TEMPERATURE[da] && TEMPERATURE[a]) {
        const x = TEMPERATURE[da], y = TEMPERATURE[a];
        const c = {C: v, F: (v - 32) * 5 / 9, K: v - 273.15}[x];
        const r = {C: c, F: c * 9 / 5 + 32, K: c + 273.15}[y];
        return [`${fmt(v)} ${SIMBOLO_T[x]} = ${fmt(r)} ${SIMBOLO_T[y]}`, fmt(r)];
    }
    const ud = UNITA.get(da), ua = UNITA.get(a);
    if (ud && ua && ud[0] === ua[0]) {
        const r = v * ud[1] / ua[1];
        return [`${fmt(v)} ${ud[2]} = ${fmt(r)} ${ua[2]}`, fmt(r)];
    }
    return null;
}

// ------------------------------------------------------------------ emoji
const EMOJI = {
    cuore: '❤️', cuori: '💕', sorriso: '😊', risata: '😂', occhiolino: '😉', bacio: '😘', triste: '😢', pianto: '😭',
    arrabbiato: '😠', pensieroso: '🤔', occhi: '👀', pollice: '👍', 'pollice giù': '👎', ok: '👌', applauso: '👏',
    grazie: '🙏', preghiera: '🙏', saluto: '👋', muscoli: '💪', fuoco: '🔥', stella: '⭐', scintille: '✨', festa: '🎉',
    regalo: '🎁', torta: '🎂', caffè: '☕', caffe: '☕', pizza: '🍕', birra: '🍺', vino: '🍷', sole: '☀️', luna: '🌙',
    pioggia: '🌧️', neve: '❄️', arcobaleno: '🌈', fiore: '🌸', rosa: '🌹', gatto: '🐱', cane: '🐶', razzo: '🚀',
    auto: '🚗', casa: '🏠', telefono: '📱', computer: '💻', lampadina: '💡', spunta: '✅', fatto: '✅', croce: '❌',
    attenzione: '⚠️', domanda: '❓', cento: '💯', italia: '🇮🇹', germania: '🇩🇪', europa: '🇪🇺', orologio: '⏰',
    calendario: '📅', lucchetto: '🔒', chiave: '🔑', soldi: '💶', euro: '💶',
};

function emoji(testo) {
    const t = testo.toLowerCase().trim();
    if (t.length < 2)
        return [];
    return Object.entries(EMOJI).filter(([n]) => n.startsWith(t)).slice(0, 4);
}

// ------------------------------------------------------------------ azioni
function impostazione(schema) {
    const src = Gio.SettingsSchemaSource.get_default();
    return src?.lookup(schema, true) ? new Gio.Settings({schema_id: schema}) : null;
}

function durata(testo) {
    const m = /^(?:timer|conto alla rovescia|sveglia tra|avvisami tra)\s+([\d.,]+)\s*(s|sec|secondi|secondo|m|min|minuti|minuto|h|ora|ore)?$/
        .exec(testo.toLowerCase().trim());
    if (!m)
        return null;
    const v = numero(m[1]);
    if (v === null)
        return null;
    const u = m[2] ?? 'min';
    const sec = Math.round(v * (u.startsWith('s') ? 1 : ['h', 'ora', 'ore'].includes(u) ? 3600 : 60));
    if (sec < 1 || sec > 24 * 3600)
        return null;
    let detto;
    if (sec % 3600 === 0)
        detto = `${fmt(sec / 3600)} ${sec === 3600 ? 'ora' : 'ore'}`;
    else if (sec % 60 === 0)
        detto = `${fmt(sec / 60)} ${sec === 60 ? 'minuto' : 'minuti'}`;
    else
        detto = `${sec} secondi`;
    return [sec, detto];
}

const vicino = (t, chiavi) => t.length >= 3 && chiavi.some(k => k.startsWith(t) || t.startsWith(k));

function azioni(testo) {
    const t = testo.toLowerCase().trim();
    const out = [];
    if (vicino(t, ['non disturbare', 'silenzio', 'notifiche'])) {
        const s = impostazione('org.gnome.desktop.notifications');
        if (s) {
            const attivo = !s.get_boolean('show-banners');
            out.push({id: 'a:non-disturbare', name: `Non disturbare: ${attivo ? 'spegni' : 'attiva'}`,
                description: attivo ? 'Ora è attivo: i banner sono nascosti' : 'Ora è spento: i banner si vedono',
                icon: 'notifications-disabled-symbolic'});
        }
    }
    if (vicino(t, ['luce notturna', 'notte', 'night light'])) {
        const s = impostazione('org.gnome.settings-daemon.plugins.color');
        if (s) {
            const accesa = s.get_boolean('night-light-enabled');
            out.push({id: 'a:luce-notturna', name: `Luce notturna: ${accesa ? 'spegni' : 'accendi'}`,
                description: accesa ? 'Ora è accesa' : 'Ora è spenta', icon: 'night-light-symbolic'});
        }
    }
    const d = durata(t);
    if (d) {
        out.push({id: `a:timer:${d[0]}`, name: `Timer di ${d[1]}`, description: 'Invio: avvio; alla fine un avviso «Timer»',
            icon: 'alarm-symbolic'});
    }
    return out;
}

function eseguiAzione(id) {
    if (id === 'a:non-disturbare') {
        const s = impostazione('org.gnome.desktop.notifications');
        s?.set_boolean('show-banners', !s.get_boolean('show-banners'));
    } else if (id === 'a:luce-notturna') {
        const s = impostazione('org.gnome.settings-daemon.plugins.color');
        s?.set_boolean('night-light-enabled', !s.get_boolean('night-light-enabled'));
    } else if (id.startsWith('a:timer:')) {
        const sec = Number(id.split(':')[2]);
        const detto = durata(`timer ${sec} s`)[1];
        // il conto lo tiene systemd (sopravvive alla panoramica e a un riavvio della Shell), l'avviso è un notify-send
        GLib.spawn_async(null, ['systemd-run', '--user', '--quiet', `--on-active=${sec}s`,
            '--timer-property=AccuracySec=100ms', `--unit=timer-ricerca-${GLib.get_real_time()}`, '/usr/bin/notify-send',
            '--app-name=Timer', '--icon=alarm-symbolic', '--urgency=critical', 'Timer', `Sono passati ${detto}`],
        null, GLib.SpawnFlags.SEARCH_PATH, null);
    }
}

// ------------------------------------------------------------------ recenti
function recenti(termini, quanti = 5) {
    const bf = new GLib.BookmarkFile();
    try {
        bf.load_from_file(GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']));
    } catch {
        return [];
    }
    const quando = uri => {
        let t = 0;
        for (const f of ['get_modified_date_time', 'get_visited_date_time', 'get_added_date_time']) {
            try {
                t = Math.max(t, bf[f](uri).to_unix());
            } catch {}
        }
        return t;
    };
    const tutti = termini.map(t => t.toLowerCase());
    const soloRecenti = tutti.length > 0 && tutti.every(t => ['recenti', 'recente', 'recent', 'ultimi'].includes(t));
    const out = [];
    for (const uri of bf.get_uris().filter(u => u.startsWith('file://')).sort((a, b) => quando(b) - quando(a))) {
        const file = Gio.File.new_for_uri(uri);
        const nome = file.get_basename() ?? '';
        if (!soloRecenti && !tutti.every(t => nome.toLowerCase().includes(t)))
            continue;
        if (!file.query_exists(null))
            continue;
        let icona = 'text-x-generic';
        try {
            icona = Gio.content_type_get_icon(bf.get_mime_type(uri)).to_string();
        } catch {}
        let cartella = file.get_parent()?.get_path() ?? '';
        const casa = GLib.get_home_dir();
        if (cartella.startsWith(casa))
            cartella = `~${cartella.slice(casa.length)}`;
        out.push({id: `r:${uri}`, name: nome, description: `Recente · ${cartella}`, icon: icona});
        if (out.length >= quanti)
            break;
    }
    return out;
}

// ------------------------------------------------------------------ provider
class Provider {
    constructor() {
        const kf = new GLib.KeyFile();
        const voce = '[Desktop Entry]\nType=Application\nName=Recenti e azioni\nIcon=document-open-recent\n' +
            'Exec=nautilus recent:///\n';
        kf.load_from_data(voce, new TextEncoder().encode(voce).length, GLib.KeyFileFlags.NONE);
        this.appInfo = GioUnix.DesktopAppInfo.new_from_keyfile(kf);   // in memoria: nessun lanciatore in griglia
        this.id = 'ricerca-azioni@codlab.de';
        this.isRemoteProvider = false;
        this.canLaunchSearch = true;
        this._metas = new Map();
    }

    _cerca(termini) {
        const testo = termini.join(' ');
        if (this._metas.size > 300)
            this._metas.clear();
        const trovati = [...azioni(testo)];
        const c = converti(testo);
        if (c) {
            trovati.push({id: `c:${testo}`, name: c[0], description: 'Invio: copia il risultato',
                icon: 'accessories-calculator-symbolic', clipboardText: c[1]});
        }
        for (const [nome, car] of emoji(testo)) {
            trovati.push({id: `e:${nome}`, name: `${car}  ${nome}`, description: 'Invio: copia l\'emoji',
                icon: 'face-smile-symbolic', clipboardText: car});
        }
        trovati.push(...recenti(termini));
        for (const m of trovati)
            this._metas.set(m.id, m);
        return trovati.map(m => m.id);
    }

    getInitialResultSet(terms, _cancellable) {
        return Promise.resolve(this._cerca(terms));
    }

    getSubsearchResultSet(_previous, terms, _cancellable) {
        return Promise.resolve(this._cerca(terms));
    }

    getResultMetas(ids, _cancellable) {
        return Promise.resolve(ids.map(id => this._metas.get(id)).filter(Boolean).map(m => ({
            id: m.id, name: m.name, description: m.description, clipboardText: m.clipboardText,
            createIcon: size => new St.Icon({gicon: Gio.icon_new_for_string(m.icon), icon_size: size}),
        })));
    }

    filterResults(results, maxNumber) {
        return results.slice(0, maxNumber);
    }

    activateResult(id, _terms) {
        if (id.startsWith('a:'))
            eseguiAzione(id);
        else if (id.startsWith('r:'))
            Gio.AppInfo.launch_default_for_uri(id.slice(2), global.create_app_launch_context(0, -1));
        // c: ed e: li copia la Shell (clipboardText)
    }

    launchSearch(_terms) {
        Gio.AppInfo.launch_default_for_uri('recent:///', global.create_app_launch_context(0, -1));
    }
}

export default class RicercaAzioni extends Extension {
    enable() {
        this._provider = new Provider();
        Main.overview.searchController.addProvider(this._provider);
        // l'intestazione del gruppo chiama animateLaunch(), che cerca l'app per id: un'appInfo in memoria non ce l'ha
        const info = this._provider.display?.providerInfo;
        if (info)
            info.animateLaunch = () => {};
    }

    disable() {
        if (this._provider)
            Main.overview.searchController.removeProvider(this._provider);
        this._provider = null;
    }
}
