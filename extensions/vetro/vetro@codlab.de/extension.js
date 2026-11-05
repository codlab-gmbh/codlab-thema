// Vetro CodLab (03–04.11.2026).
//
// Un vetro liquido nostro per barra, dock, menu del pannello
// (menu rapido e calendario compresi), banner delle notifiche e OSD, al posto di Blur my Shell su queste superfici (la
// posa spegne i suoi componenti panel, dash-to-dock e popup con le SUE chiavi; panoramica e cartelle restano a lei).
// Perché una nostra e non un fork o uno strato: README.md del componente.
//
// Come funziona: a ogni superficie un EffettoVetro (vetro.js) che copia ciò che sta dietro dal framebuffer della vista e
// lo ridisegna col materiale (materiale.glsl) prima della superficie, il cui fondo del tema diventa trasparente (classe
// vetro-codlab nel foglio). Tre cose che Blur my Shell non fa:
// - LUCE CHE SI MUOVE: la direzione della luce segue il puntatore (Meta.CursorTracker, nessun sondaggio) con una molla
//   lenta che si ferma quando arriva; con «riduci animazioni» la luce resta ferma in alto a sinistra.
// - ADATTAMENTO: la luminanza di ciò che sta dietro si misura sulla cattura (ridotta a 8×4, letta con
//   Shell.Screenshot.composite_to_stream, al più 3 volte al secondo e solo se la cattura è cambiata); con isteresi la
//   superficie passa a vetro latteo e testo scuro (classe vetro-chiaro) o torna fumé con testo chiaro. Il contrasto non
//   dipende dalla misura: lo shader limita la luminanza del vetro per la polarità attiva (v_lim), con margine per gli
//   strati interni e per il testo attenuato.
// - PROFONDITÀ PER STRATI: sui pannelli grandi niente velo uniforme; le schede interne hanno uno strato proprio (foglio).
//
// Polarità nota PRIMA del vetro (chiusura 3; cancello dell'ingresso, 04.11 18:45, ing3-chiaro). Ogni superficie nasceva
// fumé e passava a latteo solo dopo DUE misure a 330 ms l'una dall'altra: sotto carico (PSI cpu 47 %) il banner restava
// fumé più di 1,2 s e cambiava polarità fra gli scatti A e B della misura (testo letto bianco, fondo latteo: 1,17–1,40:1);
// nella sessione vera: un vetro mostrato con una polarità non ancora misurata, che poi si capovolge. Ora ogni COMPARSA
// (superficie attaccata, o di nuovo mappata: banner, menu riaperto, OSD, dock rifatto) ha la polarità NON NOTA: il
// materiale resta pieno, con fondo e testo della stessa polarità (sempre leggibile), finché la prima misura — lanciata
// subito dopo la prima cattura intera, non al giro dei 330 ms, e valida solo a superficie ferma da FERMA_DA_MS (al più
// PRIMA_FERMA_MS di entrata) — decide da sola; da lì in poi vale l'isteresi a due voti.
//
// Sicurezza («si spegne da solo»): (1) CANARINO all'abilitazione: il materiale disegna 8×8 px su una sentinella magenta
// e si legge il risultato; sentinella intatta, pixel fuori attesa o nessuna risposta in 5 s → niente vetro. (2) SENTINELLA
// DI CADUTA: alla prima pittura di ogni tipo di superficie si scrive ~/.local/state/vetro-codlab/in-prova (prima che il
// fotogramma vada alla GPU); si toglie dopo 30 pitture buone di quel tipo o, al più tardi, 1,5 s dopo la prima: un timer
// non scatta in mezzo a un fotogramma, quindi quel fotogramma è dipinto e scambiato (chiusura 1, D2: con le sole
// 30 pitture dock e menu, messi in cache dopo 3–9 fotogrammi, la lasciavano su disco per ore, e uno spegnimento brusco
// qualsiasi avrebbe spento il vetro per sempre al login dopo). Se all'avvio c'è ancora, la Shell è caduta mentre
// dipingevamo: il vetro resta spento (stato.json) finché non si cancella ~/.local/state/vetro-codlab. (3) CANE DA
// GUARDIA: un'eccezione nella pittura toglie il vetro da tutte le superfici, a OGNI accensione (chiusura 1, M2:
// il segno del guasto restava dopo disable/enable e il secondo guasto non spegneva più). Spento vuol dire: superfici col
// tema di serie (opaco, leggibile), motivo nel journal («vetro-codlab: SPENTO …») e in stato.json. Interruttore a mano:
// il file ~/.config/vetro-codlab/spento.
//
// Ciclo di vita (chiusura 2, S1): ogni enable() e ogni disable() aprono una GENERAZIONE nuova; le risposte
// asincrone (canarino, misure) portano la generazione in cui sono partite e, se nel frattempo è cambiata, non toccano
// niente. _accendi() lavora una volta sola per accensione. Riproduzione c2-rapidi-prima (04.11 09:36, versione fd9ca19):
// 20 disable(); enable() di fila → 20 accensioni sulla stessa istanza, collegamenti 25 → 177, timer 1 → 20, e
// l'iniezione in addMenu restava dopo disable (InjectionManager salva come «originale» il metodo già sostituito).
// Stato verificabile da fuori (V-CONTROLLO): ~/.local/state/vetro-codlab/stato.json dice sempre acceso, spento (col
// motivo) o disabilitato, e ogni passaggio scrive una riga «vetro-codlab: …» nel journal; posa/vetro_posa.py stato lo
// legge ed esce 0 solo se il vetro è davvero acceso.
//
// MAI Cogl.Framebuffer.read_pixels da GJS: nella Shell 51 fa SIGSEGV (sonda lab-lettura, 03.11.2026 22:54).
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {EffettoVetro, pitturaCorrente, seguiViste} from './vetro.js';

const NOME_EFFETTO = 'vetro-codlab';
const VERSIONE_STATO = 1;

// Luminanza limite del vetro (lineare) per polarità. Fumé ≤ 0,05 (il fondo del tema di serie è #36363a, 0,038): così
// anche i testi secondari del calendario (resi più chiari nel foglio) reggono 4,5:1 sopra uno strato interno (+6 %).
// Latteo ≥ 0,40: #1d1d1f ≥ 7:1, i secondari #2e2e31/#38383b ≥ 5:1 anche sotto il passaggio del puntatore (−6 %).
// Le prove le rifà contrasto.py sugli scatti (il giudice).
const LIMITE = {scuro: 0.05, chiaro: 0.40};
// Barra, dock e OSD hanno solo testo primario (bianco pieno) e icone: il fumé può essere più trasparente (bianco ≥ 6:1);
// il banner ha i secondari come i popup. La barra scende a 0,10 (chiusura 1): i pallini degli spazi di lavoro inattivi
// sono bianchi a metà opacità, e reggono 3:1 solo con il vetro ≤ 0,10 (a 0,13 stavano a 2,7:1, calcolato).
const LIMITE_SCURO = {barra: 0.10, dock: 0.13, osd: 0.10, notifica: 0.06, menu: 0.05, grande: 0.05};
// Isteresi dell'adattamento sulla luminanza media di ciò che sta dietro (lineare): latteo sopra 0,36, fumé sotto 0,22,
// e due letture di fila oltre soglia prima di cambiare (niente sfarfallio con un video dietro la barra).
const VERSO_CHIARO = 0.36, VERSO_SCURO = 0.22;
const MISURA_OGNI_MS = 330;
// Prima misura di una comparsa (chiusura 3): decide solo se la superficie è FERMA — la cattura misurata ha la geometria
// di adesso e la geometria non cambia da FERMA_DA_MS (a qualunque frequenza dei fotogrammi: una lettura più rapida di un
// fotogramma non vede il movimento, il tempo sì; prova della logica, scenario banner-zona). Durante l'entrata (banner
// che scende, menu che scivola: 150–250 ms nella Shell 51) si rimisura ogni PRIMA_RIPROVA_MS, e dopo PRIMA_FERMA_MS dalla
// prima misura si decide comunque (una superficie che non si ferma non resta piena per sempre)
const PRIMA_RIPROVA_MS = 50, PRIMA_FERMA_MS = 500, FERMA_DA_MS = 40;
// Materiale per tipo di superficie (px veri ×; il raggio null si legge dal tema della superficie)
// Ombra portata (chiusura 2): opacità, sigma e scostamento in px logici, disegnata dallo shader sotto il vetro (il
// box-shadow del foglio St la dipinge anche dentro, sopra il vetro); la barra e il dock non ne hanno.
const MATERIALI = {
    // barra: i valori della chiusura 1 (misurati col vetro vero), SENZA ombra portata. Chiusura 2, fetta 45:
    // l'ombra allargava il volume di pittura oltre il bordo sinistro del 4K, la Shell dipingeva la barra anche nella vista
    // del 2K (copia vuota) e la cattura diventava non valida: barra sul materiale pieno (c2h-stale, diag fw 2560 area 0).
    // Lente, filo e ombra più forti della fetta 39 non sono mai stati visti col vetro vero: tolti (bellezza 1 PARZIALE)
    barra: {raggio: 0, bordo: 7, lente: 3, lod: 3.4, spec: 0.55, filo: 0.30, tinta: 0.20, sat: 1.35, ombra: 0.20, strato: 0.0,
        ombraA: 0, ombraS: 0, ombraDy: 0},
    dock: {raggio: null, bordo: 15, lente: 10, lod: 3.0, spec: 0.85, filo: 0.80, tinta: 0.16, sat: 1.45, ombra: 0.45, strato: 0.0,
        ombraA: 0, ombraS: 0, ombraDy: 0},
    menu: {raggio: null, bordo: 16, lente: 9, lod: 3.6, spec: 0.70, filo: 0.70, tinta: 0.26, sat: 1.35, ombra: 0.50, strato: 0.5,
        ombraA: 0.26, ombraS: 12, ombraDy: 8},
    grande: {raggio: null, bordo: 18, lente: 11, lod: 4.0, spec: 0.60, filo: 0.70, tinta: 0.30, sat: 1.30, ombra: 0.60, strato: 1.0,
        ombraA: 0.30, ombraS: 14, ombraDy: 10},
    // banner (bellezza 3: «la stessa finitura del dock anche nel corpo del banner»): lente, filo e riflesso del
    // dock, tinta più leggera; il contrasto dei secondari lo tiene il limitatore (0,06)
    notifica: {raggio: null, bordo: 15, lente: 10, lod: 3.2, spec: 0.85, filo: 0.80, tinta: 0.20, sat: 1.40, ombra: 0.45, strato: 0.3,
        ombraA: 0.26, ombraS: 11, ombraDy: 7},
    osd: {raggio: null, bordo: 16, lente: 10, lod: 3.8, spec: 0.75, filo: 0.75, tinta: 0.24, sat: 1.40, ombra: 0.50, strato: 0.4,
        ombraA: 0.24, ombraS: 11, ombraDy: 7},
};
/** margine del quad (px logici) che contiene l'ombra portata di un materiale */
function margineOmbra(m) {
    return m.ombraA > 0 ? Math.ceil(m.ombraDy + 3 * m.ombraS) : 0;
}
// Superfici che sono SOLO fondo (il dock di Dash to Dock: il colore lo mette Dash to Dock con uno stile in linea, che il
// foglio non può battere): il vetro sostituisce la loro pittura invece di stare sotto.
const SOLO_FONDO = new Set(['dock']);
// Sentinella di caduta: un tipo esce di prova dopo tante pitture buone o, al più tardi, dopo tanti ms dalla prima
const PROVA_PITTURE = 30, PROVA_MS = 1500;
// State di Dash to Dock (docking.js: HIDDEN 0, SHOWING 1, SHOWN 2, HIDING 3)
const DOCK_ENTRA = 1, DOCK_MOSTRATO = 2;
// Ciò che sta dietro cambia (S2): una superficie in cache si ridisegna al più ogni tanti ms per un danno dietro
// di lei, e i NOSTRI ridisegni non contano come danno per le altre superfici per un margine di tanti px logici attorno
// (ombre e freccia del popup). 33 ms (30 catture al secondo: segue ancora un video a 30 fps dietro il vetro), non 16:
// col fondo che cambia a ogni fotogramma le ricatture del solo fondo sono la metà. Misurato con lo sforzo di
// costo-gpu.py (stage ridisegnato a ogni fotogramma), 04.11 15:27, a 16 ms: vetro +6,7 punti di Radeon sulla media delle
// A, p90 29 % contro 13–15 % (PSI cpu 9–17 %: NON VALIDA); sotto carico pieno (PSI 20–31 %) 16, 33 ms e nessun ridisegno
// restano nel rumore (deriva fra le A fino a 4,6 punti). Prima della chiusura 2 il vetro in cache non seguiva il fondo.
const DANNO_MIN_MS = 33, ECO_MARGINE = 96;
const _iterDanno = new Mtk.RegionIterator();

function percorso(...parti) {
    return GLib.build_filenamev(parti);
}

/** Scrittura senza fsync (chiusura 2): GLib.file_set_contents su btrfs fa fsync, e nel disable() portava la mediana da
 *  2,3 a 19,9 ms con punte di 679 ms (c2-tempi, 04.11 10:40); la sentinella in-prova lo faceva DENTRO la pittura. Per la
 *  sentinella e lo stato basta la cache del kernel: sopravvive alla caduta della Shell, che è ciò che devono ricordare.
 *  Lo spento persistente resta durevole (file_set_contents, raro). */
function scriviVeloce(file, testo) {
    GLib.file_set_contents_full(file, new TextEncoder().encode(testo), GLib.FileSetContentsFlags.NONE, 0o600);
}

function leggiMateriale(dir) {
    const [, byte] = GLib.file_get_contents(dir.get_child('materiale.glsl').get_path());
    const testo = new TextDecoder().decode(byte);
    const i = testo.indexOf('// ---- dichiarazioni ----'), j = testo.indexOf('// ---- corpo ----');
    if (i < 0 || j < i)
        throw new Error('materiale.glsl senza i segni delle due parti');
    return {dichiarazioni: testo.slice(i, j), corpo: testo.slice(j)};
}

/** Molla critica: insegue l'obiettivo senza oscillare; tau in secondi. */
class Molla {
    constructor(tau) {
        this.tau = tau;
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.tx = 0; this.ty = 0;
    }

    passo(dt) {
        const w = 2 / this.tau, k = w * w, c = 2 * w;
        for (const ass of ['x', 'y']) {
            const v = `v${ass}`, t = `t${ass}`;
            const a = k * (this[t] - this[ass]) - c * this[v];
            this[v] += a * dt;
            this[ass] += this[v] * dt;
        }
        return Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) < 0.4 && Math.abs(this.vx) + Math.abs(this.vy) < 4;
    }
}

export default class VetroCodlab extends Extension {
    enable() {
        this._gen = (this._gen ?? 0) + 1;  // le risposte asincrone di accensioni annullate non valgono più (S1)
        this._superfici = new Map();      // attore → superficie
        this._dockSeguiti = new Set();    // contenitori di Dash to Dock col loro notify::dock-state (uno ciascuno)
        this._collegamenti = [];
        this._timer = new Set();
        this._spento = false;
        this._acceso = false;
        this._guastoInCorso = false;      // ogni accensione riarma il cane da guardia (M2)
        this._inProva = new Map();        // tipo → pitture buone (-1: uscito di prova)
        this._ultimoPolo = new Map();     // tipo → l'ultima polarità decisa: il pieno di attesa delle comparse nuove
        this._distrutti = new WeakSet();  // attori che abbiamo visto distruggere: non si riattaccano (vedi _attacca)
        this._luce = new Molla(0.35);
        this._luceFerma = true;
        this._mostraTempo = 0;
        this._dirStato = percorso(GLib.get_user_state_dir(), 'vetro-codlab');
        this._fileProva = percorso(this._dirStato, 'in-prova');
        this._fileStato = percorso(this._dirStato, 'stato.json');
        this._statoLetto = this._leggiStato();
        this._inj = new InjectionManager();

        if (GLib.file_test(percorso(GLib.get_user_config_dir(), 'vetro-codlab', 'spento'), GLib.FileTest.EXISTS)) {
            this._spegni('interruttore ~/.config/vetro-codlab/spento', false);
            return;
        }
        if (this._statoLetto?.stato === 'spento' && this._statoLetto?.persistente) {
            this._spento = true;
            console.warn(`vetro-codlab: SPENTO (resta spento: ${this._statoLetto.motivo}; per riprovare cancellare ${this._dirStato})`);
            return;
        }
        if (GLib.file_test(this._fileProva, GLib.FileTest.EXISTS)) {
            let sospetti = '';
            try {
                sospetti = new TextDecoder().decode(GLib.file_get_contents(this._fileProva)[1]).trim();
            } catch {}
            this._spegni(`la Shell è caduta mentre il vetro dipingeva la prima volta (${sospetti || 'superficie ignota'})`, true);
            return;
        }
        try {
            this._sorgente = leggiMateriale(this.dir);
        } catch (e) {
            this._spegni(`materiale non leggibile: ${e.message}`, false);
            return;
        }
        this._canarino();
    }

    disable() {
        this._gen = (this._gen ?? 0) + 1;
        const eraAcceso = this._acceso;
        this._smonta();
        this._inj = null;
        // uscita pulita: una sentinella rimasta non è una caduta
        if (!this._spento)
            GLib.unlink(this._fileProva);
        // lo stato dice il vero anche da spenta (V-CONTROLLO); uno spegnimento per guasto resta scritto col suo motivo
        if (eraAcceso) {
            this._scriviStato('disabilitato', 'disable()', false);
            console.log('vetro-codlab: DISABILITATO');
        }
        this._superfici = null;
    }

    // ---------- stato e spegnimento ----------

    _leggiStato() {
        try {
            const d = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(this._fileStato)[1]));
            return d?.versione === VERSIONE_STATO ? d : null;
        } catch {
            return null;
        }
    }

    _scriviStato(stato, motivo, persistente) {
        try {
            GLib.mkdir_with_parents(this._dirStato, 0o700);
            const d = {versione: VERSIONE_STATO, stato, motivo, persistente: !!persistente,
                ora: GLib.DateTime.new_now_local().format('%F %T %Z'), estensione: this.metadata.version};
            if (persistente)
                GLib.file_set_contents(this._fileStato, JSON.stringify(d, null, 1));
            else
                scriviVeloce(this._fileStato, JSON.stringify(d, null, 1));
        } catch (e) {
            console.warn(`vetro-codlab: stato non scritto: ${e.message}`);
        }
    }

    /** Spegne il vetro su tutte le superfici (tema di serie) e scrive il motivo. persistente: resta spento ai prossimi avvii. */
    _spegni(motivo, persistente) {
        if (this._spento)
            return;
        this._spento = true;
        this._smonta();
        // la Shell è viva e il vetro si è fermato da sé: una sentinella rimasta qui NON è una caduta (prova sic-pittura,
        // 01:17: dopo il cane da guardia in-prova restava, e al login dopo il vetro sarebbe rimasto spento per sempre)
        GLib.unlink(this._fileProva);
        this._scriviStato('spento', motivo, persistente);
        console.warn(`vetro-codlab: SPENTO — ${motivo}`);
    }

    _smonta() {
        for (const id of this._timer ?? [])
            GLib.source_remove(id);
        this._timer?.clear();
        this._fermaLuce();
        for (const [ogg, id] of this._collegamenti ?? []) {
            try {
                ogg.disconnect(id);
            } catch {}
        }
        this._collegamenti = [];
        this._dockSeguiti?.clear();
        this._eco = null;
        for (const s of this._superfici?.values() ?? [])
            this._stacca(s);
        this._superfici?.clear();
        // anche spento da un guasto non resta niente di nostro nella Shell: l'iniezione in addMenu se ne va qui (S1)
        this._inj?.clear();
        this._acceso = false;
        // la texture della misura e le impostazioni del moto si rifanno all'accensione (D5)
        this._piccola = null;
        this._iface = null;
        this._a11y = null;
    }

    _collega(ogg, segnale, f) {
        const id = ogg.connect(segnale, f);
        this._collegamenti.push([ogg, id, segnale]);
        return id;
    }

    /** Un oggetto che si distrugge porta via i suoi collegamenti: li stacca ADESSO (durante «destroy» l'oggetto è ancora
     *  vivo) e li toglie dall'elenco, così _smonta non stacca mai da oggetti già distrutti (chiusura 2: Dash to Dock rifà
     *  i dock all'avvio e a ogni cambio dei monitor; prima restavano in elenco e il disable dava Gjs-CRITICAL). */
    _dimentica(ogg) {
        for (const [o, id] of this._collegamenti ?? []) {
            if (o === ogg) {
                try {
                    o.disconnect(id);
                } catch {}
            }
        }
        this._collegamenti = (this._collegamenti ?? []).filter(([o]) => o !== ogg);
    }

    _dopo(ms, f) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timer.delete(id);
            f();
            return GLib.SOURCE_REMOVE;
        });
        this._timer.add(id);
        return id;
    }

    // ---------- canarino ----------

    /** Il materiale su 8×8 px: fondo grigio noto, sentinella magenta nel bersaglio. Passa se il centro non è magenta,
     *  è opaco e sta sotto il limite della polarità scura (il limitatore lavora). Asincrono: niente vetro fino all'esito. */
    _canarino() {
        let finito = false;
        const gen = this._gen;
        const esito = (ok, perche) => {
            // la risposta di un'accensione annullata (disable() prima della lettura) non accende quella di adesso
            if (finito || gen !== this._gen || this._spento || !this._superfici)
                return;
            finito = true;
            if (ok)
                this._accendi();
            else
                this._spegni(`canarino: ${perche}`, false);
        };
        this._dopo(5000, () => esito(false, 'nessuna risposta in 5 s'));
        try {
            const ctx = global.stage.context.get_backend().get_cogl_context();
            const lato = 8;
            const dati = new Uint8Array(lato * lato * 4);
            for (let i = 0; i < lato * lato; i++)
                dati.set([200, 200, 200, 255], i * 4);
            const sorg = Cogl.Texture2D.new_from_data(ctx, lato, lato, Cogl.PixelFormat.RGBA_8888_PRE, lato * 4, dati);
            const dst = Cogl.Texture2D.new_with_size(ctx, lato, lato);
            dst.set_components(Cogl.TextureComponents.RGBA);
            dst.allocate();
            const fb = Cogl.Offscreen.new_with_texture(dst);
            fb.allocate();
            fb.orthographic(0, 0, lato, lato, -1, 1);
            fb.clear4f(Cogl.BufferBit.COLOR, 1, 0, 1, 1);
            const pip = Cogl.Pipeline.new(ctx);
            pip.set_layer_texture(0, sorg);
            pip.set_layer_filters(0, Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR, Cogl.PipelineFilter.LINEAR);
            pip.add_snippet(Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, this._sorgente.dichiarazioni, this._sorgente.corpo));
            const val = {v_dim_x: lato, v_dim_y: lato, v_raggio: 0, v_bordo: 2, v_lente: 1, v_lod: 1, v_luce_x: -100,
                v_luce_y: -100, v_spec: 0.5, v_filo: 0.5, v_polo: 0, v_lim: LIMITE.scuro, v_tinta: 0.2, v_sat: 1.2,
                v_ombra: 0.3, v_pieno: 0, v_strato: 0, v_ombra_m: 0, v_ombra_a: 0, v_ombra_s: 0, v_ombra_dy: 0};
            for (const [k, v] of Object.entries(val)) {
                const loc = pip.get_uniform_location(k);
                if (loc >= 0)
                    pip.set_uniform_1f(loc, v);
            }
            fb.draw_textured_rectangle(pip, 0, 0, lato, lato, 0, 0, 1, 1);
            fb.finish();
            const flusso = Gio.MemoryOutputStream.new_resizable();
            Shell.Screenshot.composite_to_stream(dst, 0, 0, lato, lato, 1.0, null, 0, 0, 1.0, flusso, (_o, res) => {
                try {
                    const pb = Shell.Screenshot.composite_to_stream_finish(res);
                    const px = pb.read_pixel_bytes().toArray();
                    const n = pb.get_n_channels(), st = pb.get_rowstride();
                    const c = 4 * st + 4 * n;
                    const [r, g, b] = [px[c], px[c + 1], px[c + 2]];
                    const a = n === 4 ? px[c + 3] : 255;
                    const lin = x => {
                        x /= 255;
                        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
                    };
                    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
                    this._canarinoLetto = {r, g, b, a, L: Math.round(L * 1000) / 1000};
                    if (r === 255 && g === 0 && b === 255)
                        esito(false, 'sentinella magenta intatta: il materiale non disegna (shader non compilato?)');
                    else if (a < 250)
                        esito(false, `alfa ${a} al centro`);
                    else if (L > LIMITE.scuro * 1.25 + 0.01)
                        esito(false, `luminanza ${L.toFixed(3)} sopra il limite ${LIMITE.scuro}: il limitatore non lavora`);
                    else
                        esito(true);
                } catch (e) {
                    esito(false, `lettura: ${e.message}`);
                }
            });
        } catch (e) {
            esito(false, `eccezione: ${e.message}`);
        }
    }

    // ---------- accensione e superfici ----------

    _accendi() {
        if (this._acceso || this._spento || !this._superfici)
            return;
        this._acceso = true;
        this._scriviStato('acceso', this._canarinoLetto ? `canarino ${JSON.stringify(this._canarinoLetto)}` : 'acceso', false);
        console.log(`vetro-codlab: ACCESO (generazione ${this._gen})`);
        seguiViste((o, s, f) => this._collega(o, s, f));
        // ciò che sta dietro una superficie in cache (barra, popup e dock hanno offscreen_redirect ALWAYS) cambia senza
        // che la superficie si ridipinga: la regione del ridisegno di ogni vista dice dove (S2, V-STALE)
        this._eco = new Map();
        this._collega(global.stage, 'paint-view', (_st, vista, clip) => this._danno(vista, clip));
        this._collega(global.stage, 'after-paint', (_st, vista) => this._dopoDanno(vista));
        this._impostazioniMoto();
        // luce: il puntatore muove l'obiettivo della molla; nessun sondaggio
        const tracker = global.backend.get_cursor_tracker();
        this._collega(tracker, 'position-invalidated', () => this._puntatoreMosso());
        // superfici fisse
        this._attacca(Main.panel, 'barra');
        this._cercaDock();
        this._cercaOsd();
        this._collega(Main.layoutManager, 'monitors-changed', () => this._dopo(400, () => {
            this._cercaDock();
            this._cercaOsd();
        }));
        this._collega(Main.layoutManager.uiGroup, 'child-added', (_g, a) => {
            if (a?.name === 'dashtodockContainer')
                this._dopo(200, () => this._cercaDock());
        });
        // banner delle notifiche
        const bin = Main.messageTray._bannerBin;
        if (bin) {
            this._collega(bin, 'child-added', (_b, a) => this._attacca(a, 'notifica'));
            for (const a of bin.get_children())
                this._attacca(a, 'notifica');
        }
        // menu del pannello: quelli di adesso e quelli che arrivano dopo (estensioni abilitate dopo di noi)
        const mm = Main.panel.menuManager;
        for (const m of mm._menus ?? [])
            this._seguiMenu(m);
        const ext = this;
        this._inj.overrideMethod(mm, 'addMenu', orig => function (menu, pos) {
            orig.call(this, menu, pos);
            try {
                ext._seguiMenu(menu);
            } catch (e) {
                console.warn(`vetro-codlab: menu non seguito: ${e.message}`);
            }
        });
        this._dopo(MISURA_OGNI_MS, () => this._giroMisure());
    }

    _seguiMenu(menu) {
        // niente segni sul menu: dopo disable/enable il menu va ripreso (prova sic-cicli2, 01:21: senza, i popup restavano
        // senza vetro dopo il primo ciclo)
        if (this._spento || !menu?.box || this._superfici.has(menu.box))
            return;
        const tipo = menu === Main.panel.statusArea.quickSettings?.menu || menu === Main.panel.statusArea.dateMenu?.menu
            ? 'grande' : 'menu';
        this._attacca(menu.box, tipo);
        const id = menu.connect('destroy', () => {
            this._togli(menu.box);
            this._dimentica(menu);
        });
        this._collegamenti.push([menu, id, 'destroy (menu)']);
    }

    _cercaDock() {
        if (this._spento)
            return;
        const contenitori = (Main.layoutManager._trackedActors ?? []).map(t => t.actor)
            .filter(a => a?.name === 'dashtodockContainer');
        for (const c of contenitori) {
            // il vetro sta sul fondo, che è un FRATELLO delle icone: la polarità va anche sul dash, il loro antenato,
            // perché il foglio possa scurire l'icona «Mostra applicazioni» e i pallini (D3: bianchi sul latteo)
            const fondo = c.dash?._background;
            if (!(fondo instanceof St.Widget))
                continue;
            this._attacca(fondo, 'dock', c.dash);
            // il dash ha offscreen_redirect ALWAYS: quando il dock scivola dentro dal bordo (il 2K di dock-dal-bordo,
            // l'intellihide del 4K) Clutter ridisegna la sua immagine in cache più in alto e il vetro resta quello
            // catturato fuori schermo: materiale pieno e polarità vecchia finché il puntatore non ci passa sopra
            // (c1-dockentra-prima, 04.11 03:50: y 1428–1503 su 1440, copre 0, per 4 s). Lo scivolamento non cambia
            // l'allocazione del dash (notify::allocation: 0 volte su 31 passi di slide-x, sonda delle 03:53): quando il
            // dock è arrivato (dock-state SHOWN di Dash to Dock) si chiede un ridisegno del fondo e la cattura si rifà
            // dove il dock è davvero. Durante lo scivolamento il dock è in parte fuori schermo: il materiale resta pieno.
            // Un collegamento per CONTENITORE, che guarda il fondo di adesso: Dash to Dock rifà il dash all'avvio e il
            // collegamento per fondo restava agganciato a quello vecchio (diagnosi c2-diag, 04.11 09:44: 4 collegamenti
            // notify::dock-state per 2 dock all'avvio, 2 dopo un ciclo)
            if (this._superfici.has(fondo) && 'dockState' in c && !this._dockSeguiti.has(c)) {
                this._dockSeguiti.add(c);
                this._collega(c, 'notify::dock-state', () => {
                    const f = c.dash?._background;
                    // il dock che entra dal bordo resta mappato anche fuori schermo: arriva su un fondo che la polarità
                    // di quando era dentro non conosce, è una comparsa nuova (chiusura 3)
                    const s = f ? this._superfici?.get(f) : null;
                    if (c.dockState === DOCK_ENTRA && s)
                        this._nuovaComparsa(s);
                    if (c.dockState === DOCK_MOSTRATO && f?.mapped && s)
                        f.queue_redraw();
                });
                this._collega(c, 'destroy', () => {
                    this._dockSeguiti?.delete(c);
                    this._dimentica(c);
                });
            }
        }
    }

    _cercaOsd() {
        if (this._spento)
            return;
        for (const w of Main.osdWindowManager?._osdWindows ?? []) {
            if (w?._hbox instanceof St.Widget)
                this._attacca(w._hbox, 'osd');
        }
    }

    /** contenitore: antenato dei figli della superficie quando la superficie è solo fondo (il dash del dock); riceve la
     *  classe vetro-dock-chiaro insieme alla polarità. */
    _attacca(attore, tipo, contenitore = null) {
        // un attore già distrutto non si tocca: alla chiusura della Shell le finestre dell'OSD sono distrutte ma restano in
        // Main.osdWindowManager._osdWindows, e il giro delle misure (_cercaOsd) le riattaccava: 4 Gjs-CRITICAL «already
        // disposed» per finestra a ogni giro, anche col codice della chiusura 2 (corse del cancello ing3-*, trovato nella 3)
        if (this._spento || !this._acceso || !attore || this._distrutti?.has(attore) || this._superfici.has(attore) ||
            !(attore instanceof St.Widget))
            return;
        const s = {attore, tipo, mat: MATERIALI[tipo], polo: 0, voti: 0, misura: 0, ultima: 0, idDistrutto: 0, effetto: null,
            noto: false, decisa: false, idMappata: 0, presto: 0, primaPartita: false, primaT: 0, comparsa: 0, msDecisione: null,
            contenitore: contenitore instanceof St.Widget ? contenitore : null,
            val: {v_raggio: 0, v_bordo: 0, v_lente: 0, v_lod: 0, v_luce_x: 0, v_luce_y: 0, v_spec: 0, v_filo: 0, v_polo: 0,
                v_lim: 0, v_tinta: 0, v_sat: 0, v_ombra: 0, v_pieno: 0, v_strato: 0, v_ombra_m: 0, v_ombra_a: 0, v_ombra_s: 0,
                v_ombra_dy: 0}};
        s.effetto = new EffettoVetro(this._sorgente, (eff, geo) => this._parametri(s, geo),
            e => this._guasto(e), SOLO_FONDO.has(tipo), SOLO_FONDO.has(tipo) ? 0 : margineOmbra(MATERIALI[tipo]));
        s.effetto.pitturaBuona = () => this._pitturaBuona(s);
        this._nuovaComparsa(s);
        attore.add_effect_with_name(NOME_EFFETTO, s.effetto);
        attore.add_style_class_name('vetro-codlab');
        attore.add_style_class_name(`vetro-${tipo}`);
        s.idDistrutto = attore.connect('destroy', () => {
            this._distrutti?.add(attore);
            this._togli(attore);
        });
        // menu riaperto, OSD rimostrato, dock rifatto: ciò che sta dietro può essere un altro (la polarità vecchia no)
        s.idMappata = attore.connect('notify::mapped', () => this._nuovaComparsa(s));
        this._superfici.set(attore, s);
    }

    /** Una comparsa nuova (chiusura 3): la luminanza di ciò che sta dietro non è nota. Il vetro aspetta sul materiale pieno
     *  nella polarità di adesso (fondo e testo coerenti) e la prima misura decide senza il secondo voto. */
    _nuovaComparsa(s) {
        // il pieno d'attesa di una superficie MAI decisa parte dalla polarità più probabile adesso (chiusura 3): l'ultima
        // decisa per questo tipo, o quella della barra, che misura la fascia dove compaiono banner e menu. Adesso, non
        // all'attacco: i menu si attaccano all'accensione, prima che la barra decida (prova: menu-seme-all-apertura). È
        // sempre sicuro (pieno e testo hanno la stessa polarità) e nel caso comune la decisione non cambia polarità. Una
        // superficie già decisa riparte dalla sua (un menu riaperto): la decisione nella banda resta quella di prima
        if (!s.decisa) {
            const seme = this._ultimoPolo?.get(s.tipo) ?? this._poloBarra();
            if (seme !== s.polo)
                this._polarita(s, seme);
        }
        s.noto = false;
        s.voti = 0;
        s.misura = -1;
        s.primaPartita = false;
        s.primaT = 0;
        s.nComparsa = (s.nComparsa ?? 0) + 1;   // una misura partita in una comparsa di prima non decide questa
        s.comparsa = GLib.get_monotonic_time();
        s.msDecisione = null;
        // la cattura della comparsa di prima non vale: la prima decisione si fa su una cattura intera di adesso
        s.effetto?.dimenticaCattura();
        if (s.effetto)
            s.effetto.inAttesa = true;
    }

    _stacca(s) {
        const a = s.attore;
        if (s.presto && this._timer?.delete(s.presto))
            GLib.source_remove(s.presto);
        s.presto = 0;
        try {
            if (s.idDistrutto)
                a.disconnect(s.idDistrutto);
            if (s.idMappata)
                a.disconnect(s.idMappata);
            s.idMappata = 0;
            // durante la distruzione dell'attore Clutter può aver già staccato l'effetto (get_actor() nullo): rimuoverlo
            // lì dava «The meta … is not attached to the actor» (11–14 avvisi per corsa, anche nella versione fd9ca19)
            if (s.effetto && s.effetto.get_actor() === a && a.get_effect(NOME_EFFETTO) === s.effetto)
                a.remove_effect(s.effetto);
            a.remove_style_class_name('vetro-codlab');
            a.remove_style_class_name(`vetro-${s.tipo}`);
            a.remove_style_class_name('vetro-chiaro');
        } catch {}
        try {
            s.contenitore?.remove_style_class_name('vetro-dock-chiaro');
        } catch {}
        s.effetto?.rilascia();
        s.effetto = null;
        s.contenitore = null;
    }

    _togli(attore) {
        const s = this._superfici?.get(attore);
        if (!s)
            return;
        this._stacca(s);
        this._superfici.delete(attore);
    }

    /** Cane da guardia: la prima eccezione nella pittura spegne il vetro ovunque (fuori dalla pittura). Il segno
     *  _guastoInCorso lo riazzera enable(), e l'attesa sta fra i timer (la toglie _smonta): così il cane da guardia vale a
     *  ogni accensione, anche dopo un blocco/sblocco dello schermo (riproduzione c1-m2-prima, 04.11 03:15). */
    _guasto(e) {
        if (this._guastoInCorso || this._spento)
            return;
        this._guastoInCorso = true;
        const id = GLib.idle_add(GLib.PRIORITY_HIGH, () => {
            this._timer.delete(id);
            this._spegni(`eccezione nella pittura: ${e?.message ?? e}`, false);
            return GLib.SOURCE_REMOVE;
        });
        this._timer.add(id);
    }

    /** Sentinella di caduta: in-prova dalla prima pittura buona di un tipo finché il tipo non ha PROVA_PITTURE pitture
     *  buone o non sono passati PROVA_MS (riproduzione c1-inprova-prima, 04.11 03:15: «dock grande» su disco). */
    _pitturaBuona(s) {
        // la prima cattura intera di una comparsa: la misura parte adesso, non al giro dei 330 ms (chiusura 3)
        if (!s.noto && !s.primaPartita && !s.inMisura && s.effetto?.texture) {
            s.primaPartita = true;
            this._misuraPresto(s, 0);
        }
        const n = this._inProva.get(s.tipo);
        if (n === undefined) {
            this._inProva.set(s.tipo, 1);
            this._scriviProva();
            const tipo = s.tipo;
            this._dopo(PROVA_MS, () => this._esceDiProva(tipo));
        } else if (n >= 0) {
            if (n + 1 >= PROVA_PITTURE)
                this._esceDiProva(s.tipo);
            else
                this._inProva.set(s.tipo, n + 1);
        }
    }

    _esceDiProva(tipo) {
        if (this._spento || (this._inProva?.get(tipo) ?? -1) < 0)
            return;
        this._inProva.set(tipo, -1);
        this._scriviProva();
    }

    _scriviProva() {
        const aperti = [...this._inProva].filter(([, n]) => n >= 0).map(([t]) => t);
        try {
            if (aperti.length) {
                GLib.mkdir_with_parents(this._dirStato, 0o700);
                scriviVeloce(this._fileProva, aperti.join(' '));
            } else {
                GLib.unlink(this._fileProva);
            }
        } catch (e) {
            console.warn(`vetro-codlab: sentinella non scritta: ${e.message}`);
        }
    }

    // ---------- parametri del materiale (in pittura: niente allocazioni grandi) ----------

    _parametri(s, geo) {
        const a = s.attore, m = s.mat, v = s.val;
        const k = geo.w / Math.max(1, a.width);
        let raggio = m.raggio;
        if (raggio === null) {
            const nodo = a.get_theme_node();
            raggio = nodo.get_border_radius(St.Corner.TOPLEFT);
        }
        v.v_raggio = raggio * k;
        v.v_bordo = m.bordo * k;
        v.v_lente = m.lente * k;
        v.v_lod = m.lod + Math.log2(Math.max(1, k));
        // luce: dal centro della superficie verso la luce, in px veri
        const [cx, cy] = a.get_transformed_position();
        const [w, h] = a.get_transformed_size();
        const lx = this._luceFerma ? cx - 0.6 * w - 400 : this._luce.x;
        const ly = this._luceFerma ? cy - 1.4 * h - 400 : this._luce.y;
        const sx = w > 0 ? geo.w / w : k;
        v.v_luce_x = (lx - (cx + w / 2)) * sx;
        v.v_luce_y = (ly - (cy + h / 2)) * sx;
        v.v_spec = m.spec;
        v.v_filo = m.filo;
        v.v_polo = s.polo;
        v.v_lim = s.polo ? LIMITE.chiaro : LIMITE_SCURO[s.tipo] ?? LIMITE.scuro;
        // fumé più sobrio (chiusura 2: «sullo scuro il colore è ricco, a tratti dominante»): più tinta verso il
        // nero e vivacità ridotta; tolta l'ombra CSS che lo scuriva da sopra, il fumé mostrava più colore di prima
        v.v_tinta = s.polo ? m.tinta : Math.min(0.6, m.tinta + 0.10);
        v.v_sat = s.polo ? m.sat : 1 + (m.sat - 1) * 0.65;
        v.v_ombra = m.ombra;
        v.v_pieno = 0;
        v.v_strato = m.strato;
        const mo = s.effetto?.margineOmbra ?? 0;
        v.v_ombra_m = mo * k;
        v.v_ombra_a = mo > 0 ? m.ombraA : 0;
        v.v_ombra_s = m.ombraS * k;
        v.v_ombra_dy = m.ombraDy * k;
        return v;
    }

    // ---------- luce che si muove ----------

    _impostazioniMoto() {
        const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        let a11y = null;
        try {
            const src = Gio.SettingsSchemaSource.get_default();
            const sch = src.lookup('org.gnome.desktop.a11y.interface', true);
            if (sch?.has_key('reduced-motion'))
                a11y = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'});
        } catch {}
        const aggiorna = () => {
            const ferma = !iface.get_boolean('enable-animations') || (a11y && a11y.get_enum('reduced-motion') === 1);
            this._luceFerma = !!ferma;
            if (ferma)
                this._fermaLuce();
            else
                this._puntatoreMosso();
            this._ridisegna();
        };
        this._collega(iface, 'changed::enable-animations', aggiorna);
        if (a11y)
            this._collega(a11y, 'changed::reduced-motion', aggiorna);
        this._iface = iface;
        this._a11y = a11y;
        const [x, y] = global.get_pointer();
        this._luce.x = this._luce.tx = x;
        this._luce.y = this._luce.ty = y;
        aggiorna();
    }

    _puntatoreMosso() {
        if (this._luceFerma || this._spento)
            return;
        const [x, y] = global.get_pointer();
        this._luce.tx = x;
        this._luce.ty = y;
        if (!this._lineaTempo) {
            this._ultimoPasso = GLib.get_monotonic_time();
            this._lineaTempo = new Clutter.Timeline({actor: Main.panel, duration: 1000, repeat_count: -1});
            this._lineaTempo.connect('new-frame', () => this._passoLuce());
            this._lineaTempo.start();
        }
    }

    _passoLuce() {
        const ora = GLib.get_monotonic_time();
        const dt = Math.min(0.05, Math.max(0.001, (ora - this._ultimoPasso) / 1e6));
        this._ultimoPasso = ora;
        const fermo = this._luce.passo(dt);
        this._ridisegna();
        if (fermo)
            this._fermaLuce();
    }

    _fermaLuce() {
        if (this._lineaTempo) {
            this._lineaTempo.stop();
            this._lineaTempo.run_dispose();
            this._lineaTempo = null;
        }
    }

    _ridisegna() {
        for (const s of this._superfici?.values() ?? []) {
            if (s.attore.mapped)
                s.attore.queue_redraw();
        }
    }

    // ---------- ciò che sta dietro cambia (chiusura 2, S2) ----------
    //
    // Barra, popup e dock si dipingono in un offscreen della Shell (offscreen_redirect ALWAYS) che resta valido finché
    // il LORO contenuto non cambia: quando cambia solo ciò che sta dietro, Clutter ricompone l'immagine in cache e il
    // nostro effetto non è chiamato, quindi niente cattura (riproduzione c2-stale-prima, 04.11 09:40: fondo da bianco a
    // nero, dopo 3 s dock e menu rapido ancora latteo con le catture ferme). paint-view dà, prima di ogni pittura di
    // vista, la regione del ridisegno: se tocca la geometria della cattura di una superficie e la superficie in quella
    // pittura non ha catturato, le si chiede un ridisegno (al fotogramma dopo la cattura è nuova, senza un gesto).
    // Le regioni dei NOSTRI ridisegni del fotogramma prima non contano (niente rimbalzo fra due superfici in cache
    // vicine); il tetto DANNO_MIN_MS limita il costo con un video dietro.

    _danno(vista, clip) {
        if (!this._acceso || this._spento || !this._superfici)
            return;
        try {
            const lay = vista.layout, k = vista.get_scale();
            const eco = this._eco?.get(vista) ?? null;
            this._eco?.delete(vista);
            const rett = [];
            if (clip) {
                for (_iterDanno.init(clip); !_iterDanno.at_end(); _iterDanno.next()) {
                    const r = _iterDanno.rectangle;
                    const x0 = (r.x - lay.x) * k, y0 = (r.y - lay.y) * k;
                    const x1 = x0 + r.width * k, y1 = y0 + r.height * k;
                    if (eco && eco.some(e => x0 >= e[0] && y0 >= e[1] && x1 <= e[2] && y1 <= e[3]))
                        continue;
                    rett.push(x0, y0, x1, y1);
                }
            } else {
                rett.push(0, 0, lay.width * k, lay.height * k);
            }
            if (!rett.length)
                return;
            for (const s of this._superfici.values()) {
                const eff = s.effetto, g = eff?.ultimaGeometria;
                if (!g || eff.vistaCattura !== vista || !s.attore.mapped)
                    continue;
                for (let i = 0; i < rett.length; i += 4) {
                    if (rett[i] < g.sx + g.w && rett[i + 2] > g.sx && rett[i + 1] < g.sy + g.h && rett[i + 3] > g.sy) {
                        s.danno = true;
                        break;
                    }
                }
            }
        } catch (e) {
            this._erroriDanno = (this._erroriDanno ?? 0) + 1;
            if (this._erroriDanno === 1)
                console.warn(`vetro-codlab: danno non letto: ${e.message}`);
        }
    }

    _dopoDanno(vista) {
        if (!this._acceso || this._spento || !this._superfici)
            return;
        const ora = GLib.get_monotonic_time(), n = pitturaCorrente();
        for (const s of this._superfici.values()) {
            if (!s.danno)
                continue;
            s.danno = false;
            const eff = s.effetto;
            // dipinta in questa pittura: ha già catturato ciò che c'è dietro adesso
            if (!eff || eff.vistaCattura !== vista || eff.pitturaCattura === n)
                continue;
            const passati = (ora - (s.ultimoDanno ?? 0)) / 1000;
            if (passati >= DANNO_MIN_MS) {
                this._ridisegnaPerDanno(s, vista);
            } else if (!s.dannoInAttesa) {
                s.dannoInAttesa = this._dopo(Math.ceil(DANNO_MIN_MS - passati), () => {
                    s.dannoInAttesa = 0;
                    if (this._superfici?.get(s.attore) === s && s.attore.mapped)
                        this._ridisegnaPerDanno(s, s.effetto?.vistaCattura);
                });
            }
        }
    }

    _ridisegnaPerDanno(s, vista) {
        s.ultimoDanno = GLib.get_monotonic_time();
        s.ridisegniDanno = (s.ridisegniDanno ?? 0) + 1;
        s.attore.queue_redraw();
        const g = s.effetto?.ultimaGeometria;
        if (!g || !vista)
            return;
        const m = ECO_MARGINE * vista.get_scale();
        const eco = this._eco.get(vista) ?? [];
        eco.push([g.sx - m, g.sy - m, g.sx + g.w + m, g.sy + g.h + m]);
        this._eco.set(vista, eco);
    }

    // ---------- adattamento chiaro/scuro ----------

    _giroMisure() {
        if (this._spento || !this._superfici)
            return;
        // Dash to Dock rifà i dock all'avvio e a ogni cambio dei monitor, a volte dopo i nostri 200/400 ms (c2-rapidi-dopo,
        // 04.11 09:45: il dock del 2K mancava all'accensione d'avvio): una volta al secondo si cercano i nuovi
        this._giri = (this._giri ?? 0) + 1;
        if (this._giri % 3 === 0) {
            this._cercaDock();
            this._cercaOsd();
        }
        const ora = GLib.get_monotonic_time();
        for (const s of this._superfici.values()) {
            if (!s.attore.mapped || !s.effetto || s.inMisura || s.presto)
                continue;
            const tex = s.effetto.texture;
            if (!tex)
                continue;
            // una comparsa non ancora decisa si misura a ogni giro (rete sotto la misura subito, se non è partita)
            if (s.noto && (s.effetto.catture === s.misura || ora - s.ultima < MISURA_OGNI_MS * 1000))
                continue;
            s.misura = s.effetto.catture;
            s.ultima = ora;
            this._misura(s, tex);
        }
        this._dopo(MISURA_OGNI_MS, () => this._giroMisure());
    }

    /** La misura di una comparsa non ancora decisa, fuori dalla pittura, fra ms millisecondi (chiusura 3). */
    _misuraPresto(s, ms) {
        if (s.presto || s.noto || this._spento)
            return;
        s.presto = this._dopo(ms, () => {
            s.presto = 0;
            if (this._superfici?.get(s.attore) !== s || s.noto || s.inMisura || !s.attore.mapped)
                return;
            const tex = s.effetto?.texture;
            if (!tex) {
                s.primaPartita = false;     // la cattura non è più intera: riparte dalla prossima cattura intera
                return;
            }
            s.misura = s.effetto.catture;
            s.ultima = GLib.get_monotonic_time();
            this._misura(s, tex);
        });
    }

    /** Luminanza media di ciò che sta dietro la superficie: la cattura ridotta a 8×4 con le mipmap, letta senza read_pixels. */
    _misura(s, tex) {
        // la geometria della cattura misurata: la prima decisione di una comparsa vale solo se la superficie è ancora lì
        const geo0 = s.effetto?.ultimaGeometria ?? null, comparsa = s.nComparsa;
        if (!s.noto && !s.primaT)
            s.primaT = GLib.get_monotonic_time();
        try {
            const ctx = global.stage.context.get_backend().get_cogl_context();
            if (!this._piccola) {
                const t = Cogl.Texture2D.new_with_size(ctx, 8, 4);
                t.set_components(Cogl.TextureComponents.RGBA);
                t.allocate();
                const fb = Cogl.Offscreen.new_with_texture(t);
                fb.allocate();
                fb.orthographic(0, 0, 8, 4, -1, 1);
                const pip = Cogl.Pipeline.new(ctx);
                pip.set_layer_filters(0, Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR, Cogl.PipelineFilter.LINEAR);
                pip.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
                // l'alfa del framebuffer della vista non vale niente (corsa v5, 01:03: alfa 0 ovunque, nessuna misura):
                // si tiene il colore e si mette l'alfa a 1, sopra un fondo nero opaco
                pip.add_snippet(Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, '', 'cogl_color_out = vec4(cogl_color_out.rgb, 1.0);'));
                this._piccola = {t, fb, pip};
            }
            const {t, fb, pip} = this._piccola;
            pip.set_layer_texture(0, tex);
            fb.clear4f(Cogl.BufferBit.COLOR, 0, 0, 0, 1);
            fb.draw_textured_rectangle(pip, 0, 0, 8, 4, 0, 0, 1, 1);
            fb.flush();     // il disegno è nel diario di Cogl finché non si svuota (corsa v7: letture tutte nere)
            s.inMisura = true;
            const gen = this._gen;
            const flusso = Gio.MemoryOutputStream.new_resizable();
            Shell.Screenshot.composite_to_stream(t, 0, 0, 8, 4, 1.0, null, 0, 0, 1.0, flusso, (_o, res) => {
                s.inMisura = false;
                // una misura partita prima di un disable()/enable() appartiene a una superficie che non c'è più, anche
                // se l'attore è lo stesso: non decide la polarità di quella nuova
                if (gen !== this._gen || this._spento || this._superfici?.get(s.attore) !== s)
                    return;
                // partita prima che la superficie sparisse e ricomparisse (menu chiuso e riaperto): ciò che ha misurato è
                // il fondo di prima; la comparsa di adesso si misura da capo
                if (comparsa !== s.nComparsa) {
                    if (!s.noto)
                        this._misuraPresto(s, 0);
                    return;
                }
                try {
                    const pb = Shell.Screenshot.composite_to_stream_finish(res);
                    const px = pb.read_pixel_bytes().toArray();
                    const n = pb.get_n_channels(), st = pb.get_rowstride();
                    const lin = x => {
                        x /= 255;
                        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
                    };
                    let somma = 0, conta = 0;
                    for (let y = 0; y < 4; y++) {
                        for (let x = 0; x < 8; x++) {
                            const c = y * st + x * n;
                            somma += 0.2126 * lin(px[c]) + 0.7152 * lin(px[c + 1]) + 0.0722 * lin(px[c + 2]);
                            conta++;
                        }
                    }
                    if (conta)
                        this._decidi(s, somma / conta, geo0);
                } catch (e) {
                    // una comparsa non decisa riprova a ogni giro (resta sul pieno): l'avviso una volta per comparsa
                    if (s.avvisoMisura !== s.nComparsa) {
                        s.avvisoMisura = s.nComparsa;
                        console.warn(`vetro-codlab: misura non riuscita (${s.tipo}): ${e.message}`);
                    }
                }
            });
        } catch (e) {
            s.inMisura = false;
            console.warn(`vetro-codlab: misura non avviata (${s.tipo}): ${e.message}`);
        }
    }

    _decidi(s, L, geo0 = null) {
        s.luminanza = L;
        // le soglie dipendono dalla polarità di riferimento (isteresi): quella di adesso, e per la PRIMA decisione di una
        // superficie mai decisa il fumé, come prima della chiusura 3 (il seme del pieno d'attesa è solo l'aspetto
        // dell'attesa: nella banda 0,22–0,36 una superficie nuova resta fumé). Un menu riaperto parte dalla sua polarità
        const rif = s.decisa ? s.polo : 0;
        const verso = rif === 0 ? (L > VERSO_CHIARO ? 1 : 0) : (L < VERSO_SCURO ? 0 : 1);
        if (!s.noto) {
            // prima misura della comparsa (chiusura 3): la superficie è sul materiale pieno, non c'è uno sfarfallio da
            // evitare e la misura decide da sola. Ma solo se la superficie è ferma dove è stata catturata (stessa
            // geometria, nessun movimento da FERMA_DA_MS): durante l'entrata si rimisura la cattura di adesso, fino a
            // PRIMA_FERMA_MS dalla prima misura
            const g = s.effetto?.ultimaGeometria, ora = GLib.get_monotonic_time();
            const ferma = !!g && !!geo0 && g.sx === geo0.sx && g.sy === geo0.sy && g.w === geo0.w && g.h === geo0.h &&
                ora - (s.effetto?.geometriaDa ?? 0) >= FERMA_DA_MS * 1000;
            if (!ferma && ora - s.primaT < PRIMA_FERMA_MS * 1000) {
                s.misura = -1;
                this._misuraPresto(s, PRIMA_RIPROVA_MS);
                return;
            }
            s.noto = true;
            s.decisa = true;
            s.voti = 0;
            s.msDecisione = Math.round((GLib.get_monotonic_time() - s.comparsa) / 1000);
            if (verso !== s.polo)
                this._polarita(s, verso);
            this._ultimoPolo?.set(s.tipo, s.polo);
            // il vetro si mostra adesso, nello stesso fotogramma della classe: fondo e testo cambiano insieme
            if (s.effetto)
                s.effetto.inAttesa = false;
            s.attore.queue_redraw();
            return;
        }
        if (verso === s.polo) {
            s.voti = 0;
            return;
        }
        s.voti++;
        if (s.voti < 2) {
            s.misura = -1;        // seconda lettura al giro dopo anche se la cattura non è cambiata
            return;
        }
        s.voti = 0;
        this._polarita(s, verso);
        this._ultimoPolo?.set(s.tipo, s.polo);
        s.attore.queue_redraw();
    }

    /** La polarità decisa della barra (0 se non c'è o non è ancora decisa). */
    _poloBarra() {
        for (const s of this._superfici?.values() ?? [])
            if (s.tipo === 'barra' && s.noto)
                return s.polo;
        return 0;
    }

    /** La polarità sulla superficie (e sul dash del dock): la classe del foglio e il polo dello shader insieme. */
    _polarita(s, verso) {
        s.polo = verso;
        if (verso) {
            s.attore.add_style_class_name('vetro-chiaro');
            s.contenitore?.add_style_class_name('vetro-dock-chiaro');
        } else {
            s.attore.remove_style_class_name('vetro-chiaro');
            s.contenitore?.remove_style_class_name('vetro-dock-chiaro');
        }
    }

    // ---------- per le prove nell'isola (sola lettura) ----------

    statoPerProve() {
        return {
            acceso: this._acceso, spento: this._spento, canarino: this._canarinoLetto ?? null, luceFerma: this._luceFerma,
            superfici: [...(this._superfici?.values() ?? [])].map(s => ({tipo: s.tipo, polo: s.polo,
                noto: !!s.noto, inAttesa: !!s.effetto?.inAttesa, comparse: s.nComparsa ?? 0, msDecisione: s.msDecisione,
                luminanza: s.luminanza ?? null, fotogrammi: s.effetto?.fotogrammi ?? 0, disegnata: !!s.effetto?.disegnata,
                pieno: !!s.effetto?.pieno, diag: s.effetto ? {...s.effetto.diag} : null, ridisegniDanno: s.ridisegniDanno ?? 0,
                misura: {in: !!s.inMisura, ultima: s.misura, catture: s.effetto?.catture ?? 0, tex: !!s.effetto?.texture,
                    mapped: s.attore.mapped},
                classe: s.attore.get_style_class_name(), contenitore: s.contenitore?.get_style_class_name() ?? null})),
            collegamenti: this._collegamenti?.length ?? 0, timer: this._timer?.size ?? 0, generazione: this._gen ?? 0,
            segnali: (this._collegamenti ?? []).reduce((m, [, , n]) => ({...m, [n]: (m[n] ?? 0) + 1}), {}),
            guastoInCorso: !!this._guastoInCorso, inProva: Object.fromEntries(this._inProva ?? []),
            erroriDanno: this._erroriDanno ?? 0,
        };
    }
}
