// vetro.js — il materiale del Vetro CodLab: cattura di ciò che sta dietro una superficie e un solo shader GLSL.
//
// 03.11.2026. Tecnica imparata leggendo Blur my Shell 77
// (render/backdrop/capture.js): in vfunc_paint_node tutto ciò che sta sotto la superficie è già nel framebuffer della
// vista; lo si copia (Cogl.Framebuffer.blit) in una texture nostra, solo nei rettangoli danneggiati, e lo si ridisegna
// col nostro shader al posto del fondo del tema. Riscritto da capo, più piccolo: una texture per superficie (le nostre
// superfici stanno su un monitor solo), mipmap per la sfocatura, ripiego senza cattura fuori da una vista.
//
// MAI Cogl.Framebuffer.read_pixels da GJS: nella Shell 51 fa SIGSEGV (sonda lab-lettura, 03.11.2026 22:54).
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';

// Tutto ciò che si alloca in pittura è spazzatura, e mentre il GC spazza GJS salta le chiamate JS di pittura (avviso
// di Blur my Shell, render/paint_nodes.js): una scatola e un colore riusati per ogni fotogramma.
const _scatola = new Clutter.ActorBox();
const _scatolaVolume = new Clutter.ActorBox();
const _colore = new Cogl.Color();
const MAX_TEX = 8192;

let _vistaInPittura = null;
let _pittureVista = 0;

/** La vista che la Shell sta dipingendo adesso (fra before-paint e after-paint), come Blur my Shell. */
export function seguiViste(connetti) {
    connetti(global.stage, 'before-paint', (_s, vista) => { _vistaInPittura = vista; _pittureVista++; });
    connetti(global.stage, 'after-paint', () => { _vistaInPittura = null; });
}

/** Il numero della pittura di vista in corso (cresce a ogni before-paint): l'effetto lo segna quando cattura. */
export function pitturaCorrente() {
    return _pittureVista;
}

// solo uniformi float singole: set_uniform_1f è sicuro da GJS (niente array C senza lunghezza)
export const UNIFORMI = ['v_dim_x', 'v_dim_y', 'v_raggio', 'v_bordo', 'v_lente', 'v_lod', 'v_luce_x', 'v_luce_y', 'v_spec',
    'v_filo', 'v_polo', 'v_lim', 'v_tinta', 'v_sat', 'v_ombra', 'v_pieno', 'v_strato', 'v_ombra_m', 'v_ombra_a', 'v_ombra_s',
    'v_ombra_dy'];

/** Geometria dell'attore nel framebuffer della vista che si sta dipingendo (pixel veri): i vertici assoluti
 *  dell'allocazione meno l'origine della vista, per la sua scala (come viewCaptureGeometry di Blur my Shell). Vale anche
 *  per gli attori trasformati (il popup che si apre scalando). Niente matrici del framebuffer da GJS: nella prima corsa
 *  (04.11 00:48) la Shell isolata è caduta in StructInstance::new_for_c_struct dentro la pittura (FallbackInOut). */
function geometria(attore, vista) {
    const lay = vista.layout, s = vista.get_scale();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of attore.get_abs_allocation_vertices()) {
        const X = (v.x - lay.x) * s, Y = (v.y - lay.y) * s;
        x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
    }
    if (![x0, y0, x1, y1].every(Number.isFinite))
        return null;
    const sx = Math.floor(x0 + 1 / 1024), sy = Math.floor(y0 + 1 / 1024);
    const w = Math.max(1, Math.ceil(x1 - 1 / 1024) - sx), h = Math.max(1, Math.ceil(y1 - 1 / 1024) - sy);
    return {sx, sy, w, h};
}

const _iteratore = new Mtk.RegionIterator();

export const EffettoVetro = GObject.registerClass({
    GTypeName: 'CodlabVetroEffetto',
}, class EffettoVetro extends Clutter.Effect {
    /** sorgente: testo GLSL (dichiarazioni, corpo); parametri(effetto, geo) → valori delle uniformi; guardia(errore) se
     *  la pittura lancia (il cane da guardia dell'estensione spegne tutto); soloFondo: la superficie è solo fondo (il dock
     *  di Dash to Dock) e il vetro ne prende il posto invece di stare sotto. margineOmbra: px logici per lato attorno alla
     *  superficie dove lo shader disegna l'ombra portata (0: niente ombra). */
    _init(sorgente, parametri, guardia, soloFondo = false, margineOmbra = 0) {
        super._init();
        this.margineOmbra = margineOmbra;
        this._sorgente = sorgente;
        this._parametri = parametri;
        this._guardia = guardia;
        this._soloFondo = soloFondo;
        this.catture = 0;          // cresce a ogni copia dal framebuffer (l'adattamento misura solo se è cambiata)
        this.vistaCattura = null;  // la vista dell'ultima cattura (ultimaGeometria è in pixel di quella vista)
        this.pitturaCattura = -1;  // la pittura di vista dell'ultima cattura (pitturaCorrente)
        this.pitturaBuona = null;  // chiamata dopo ogni vetro disegnato (sentinella di caduta)
        this._t = null;            // {ctx, tex, fb, pip, w, h, loc}
        this._valida = false;      // la texture ha una cattura intera
        this._codaPittura = -1;
        this.fotogrammi = 0;
        this.ultimaGeometria = null;
        this.disegnata = false;
        this.pieno = true;
        // la polarità di questa comparsa non è ancora decisa da una misura (chiusura 3): materiale pieno anche con una
        // cattura intera, perché il testo ha il colore della polarità di adesso e il vetro non deve ancora mostrarsi
        this.inAttesa = false;
        this.geometriaDa = 0;      // quando la geometria della cattura è cambiata l'ultima volta (µs): ferma da quanto
        this.diag = {sx: 0, sy: 0, w: 0, h: 0, fw: 0, fh: 0, area: 0, rett: 0, clip: 0, nuova: 0, copre: 0};
    }

    _assicura(ctx, w, h) {
        if (this._t && this._t.ctx === ctx && this._t.w === w && this._t.h === h)
            return true;
        if (w <= 0 || h <= 0 || w > MAX_TEX || h > MAX_TEX)
            return false;
        // Due texture: la COPIA riceve il blit dal framebuffer della vista; il VETRO la riceve disegnata e ha le mipmap
        // per la sfocatura. Un blit NON rifà le mipmap (sonda lab-mip2, 04.11 01:09: dopo il blit il livello 4 resta
        // quello vecchio, anche con set_auto_mipmap); un disegno sì. Senza questo il vetro leggeva livelli neri.
        const nuovaTex = () => {
            const t = Cogl.Texture2D.new_with_size(ctx, w, h);
            t.set_components(Cogl.TextureComponents.RGBA);
            t.allocate();
            const f = Cogl.Offscreen.new_with_texture(t);
            f.allocate();
            f.orthographic(0, 0, w, h, -1, 1);
            f.clear4f(Cogl.BufferBit.COLOR, 0, 0, 0, 1);
            return [t, f];
        };
        const [copia, fbCopia] = nuovaTex();
        const [tex, fb] = nuovaTex();
        const pipCopia = Cogl.Pipeline.new(ctx);
        pipCopia.set_layer_texture(0, copia);
        pipCopia.set_layer_filters(0, Cogl.PipelineFilter.NEAREST, Cogl.PipelineFilter.NEAREST);
        pipCopia.set_blend('RGBA = ADD(SRC_COLOR, 0)');
        const pip = Cogl.Pipeline.new(ctx);
        pip.set_layer_texture(0, tex);
        pip.set_layer_filters(0, Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR, Cogl.PipelineFilter.LINEAR);
        pip.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
        pip.add_snippet(Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, this._sorgente.dichiarazioni, this._sorgente.corpo));
        const loc = {};
        for (const u of UNIFORMI)
            loc[u] = pip.get_uniform_location(u);
        this._t = {ctx, tex, fb, pip, w, h, loc, copia, fbCopia, pipCopia};
        this._valida = false;
        return true;
    }

    _uniformi(geo) {
        const p = this._parametri(this, geo);
        const {pip, loc} = this._t;
        pip.set_uniform_1f(loc.v_dim_x, geo.w);
        pip.set_uniform_1f(loc.v_dim_y, geo.h);
        for (const k in p)
            if (loc[k] !== undefined && loc[k] >= 0)
                pip.set_uniform_1f(loc[k], p[k]);
        if (loc.v_pieno >= 0)
            pip.set_uniform_1f(loc.v_pieno, this.pieno ? 1 : 0);
    }

    vfunc_paint_node(node, ctx, flags) {
        const attore = this.get_actor();
        try {
            if ((flags & Clutter.EffectPaintFlags.BYPASS_EFFECT) || attore.width < 1 || attore.height < 1) {
                if (!this._soloFondo || !this._t)
                    node.add_child(new Clutter.ActorNode(attore, -1));
                return;
            }
            // si cattura solo mentre si dipinge una vista dello stage (come Blur my Shell: il framebuffer del contesto,
            // che con le viste offscreen NON è quello di vista.get_framebuffer()), mai nei cloni né negli screencast
            // Dentro una vista, se il framebuffer del contesto non è quello della vista, la superficie (o un suo antenato)
            // si sta dipingendo in un offscreen: la barra e i popup della Shell 51 hanno offscreen_redirect ALWAYS
            // (panel.js, boxpointer.js), il dock di Dash to Dock idem. Lì dietro non c'è niente: ciò che sta dietro è
            // nel framebuffer della VISTA, già dipinto (come Blur my Shell quando trova un antenato offscreen).
            // Corsa v3 (00:55): senza questo la barra copiava dal suo offscreen 6150×70 (vetro nero) e i popup non
            // avevano mai una cattura intera.
            const vista = _vistaInPittura;
            const fb = vista && !attore.is_in_clone_paint() ? vista.get_framebuffer() : null;
            const dallaVista = !!(fb && ctx.get_framebuffer());
            const geo = dallaVista ? geometria(attore, vista) : null;
            // Una vista che NON contiene la superficie (la Shell dipinge un attore in ogni vista che il suo volume tocca:
            // l'ombra di un menu al bordo sinistro del 4K tocca il 2K) non tocca lo stato della cattura: lì la copia è
            // vuota e la scala diversa riallocava la texture, e la cattura buona dell'altra vista diventava non valida
            // (prova della logica, due-viste: menu pieno per sempre se quella vista dipinge per ultima). Il vetro si
            // disegna lo stesso, com'è: la fetta 44 lo saltava e negli scatti la barra usciva trasparente (chiusura 3)
            const fuori = !!geo && (geo.sx >= fb.get_width() || geo.sy >= fb.get_height() || geo.sx + geo.w <= 0 ||
                geo.sy + geo.h <= 0);
            if (fuori && !this._t)
                this._assicura(fb.get_context(), geo.w, geo.h);   // solo per avere il materiale pieno da disegnare
            if (dallaVista && geo && !fuori && this._assicura(fb.get_context(), geo.w, geo.h)) {
                this._cattura(fb, vista, geo, ctx, attore);
                const g0 = this.ultimaGeometria;
                if (!g0 || g0.sx !== geo.sx || g0.sy !== geo.sy || g0.w !== geo.w || g0.h !== geo.h)
                    this.geometriaDa = GLib.get_monotonic_time();
                this.ultimaGeometria = geo;
                this.vistaCattura = vista;
                this.pitturaCattura = _pittureVista;
            }
            if (this._t && (this.ultimaGeometria ?? geo)) {
                const g = this.ultimaGeometria ?? geo;
                // senza una cattura intera (popup che si apre, primo fotogramma) il materiale PIENO: sotto la classe
                // vetro-codlab il fondo del tema è trasparente, e una superficie senza fondo lascerebbe il testo sul nudo
                // sfondo (prima corsa v2, 00:52: menu rapido con i testi sullo sfondo). PIENO anche finché la polarità
                // non è decisa (inAttesa, chiusura 3): pieno e testo hanno la stessa polarità, sempre leggibili
                this.pieno = !this._valida || this.inAttesa;
                this._uniformi(g);
                const o = attore.get_paint_opacity() / 255;
                _colore.init_from_4f(o, o, o, o);
                this._t.pip.set_color(_colore);
                const out = new Clutter.PipelineNode(this._t.pip);
                const m = this.margineOmbra;
                _scatola.init(-m, -m, attore.width + m, attore.height + m);
                out.add_texture_rectangle(_scatola, 0, 0, 1, 1);
                node.add_child(out);
                this.disegnata = true;
                this.pitturaBuona?.();
            }
            // la superficie solo fondo non si dipinge quando c'è il vetro (il suo colore in linea coprirebbe il vetro)
            if (!(this._soloFondo && this.disegnata && this._t))
                node.add_child(new Clutter.ActorNode(attore, -1));
            this.fotogrammi++;
        } catch (e) {
            // la pittura non deve mai lanciare due volte: l'estensione spegne il vetro e passa al ripiego
            node.add_child(new Clutter.ActorNode(attore, -1));
            this._guardia?.(e);
        }
    }

    /** Copia dal framebuffer della vista solo i rettangoli danneggiati (tutta la regione se non c'è un ritaglio). La
     *  texture è valida quando una copia ha coperto la superficie (≥ 98 %: gli arrotondamenti fra pixel logici e veri
     *  lasciano fili di 1 px); se il danno non la copre, un ridisegno intero al fotogramma dopo (la sfocatura fa
     *  dipendere ogni pixel dai vicini), mai due di fila (niente giri a 240 Hz). */
    _cattura(fb, vista, geo, ctx, attore) {
        const nuova = !this._valida || !this.ultimaGeometria ||
            ['sx', 'sy', 'w', 'h'].some(k => this.ultimaGeometria[k] !== geo[k]);
        const fw = fb.get_width(), fh = fb.get_height();
        const clip = ctx.get_redraw_clip();
        let area = 0, rett = 0;
        const copia = (rx, ry, rx2, ry2) => {
            const x = Math.max(0, geo.sx, rx), y = Math.max(0, geo.sy, ry);
            const x2 = Math.min(fw, geo.sx + geo.w, rx2), y2 = Math.min(fh, geo.sy + geo.h, ry2);
            const dx = x - geo.sx, dy = y - geo.sy;
            const w = Math.min(x2 - x, this._t.w - dx), h = Math.min(y2 - y, this._t.h - dy);
            if (w > 0 && h > 0 && dx >= 0 && dy >= 0) {
                fb.blit(this._t.fbCopia, x, y, dx, dy, w, h);
                area += w * h;
                rett++;
            }
            if (rett)
                this.catture++;
        };
        if (!clip) {
            copia(geo.sx, geo.sy, geo.sx + geo.w, geo.sy + geo.h);
        } else {
            // l'iteratore delle regioni come Blur my Shell (mai get_rectangle(i): struttura per valore da GJS)
            const lay = vista.layout, s = vista.get_scale();
            for (_iteratore.init(clip); !_iteratore.at_end(); _iteratore.next()) {
                const r = _iteratore.rectangle;
                copia(Math.floor((r.x - lay.x) * s), Math.floor((r.y - lay.y) * s),
                    Math.ceil((r.x + r.width - lay.x) * s), Math.ceil((r.y + r.height - lay.y) * s));
            }
        }
        if (rett)       // la copia passa nel vetro con un disegno: così le mipmap si rifanno
            this._t.fb.draw_textured_rectangle(this._t.pipCopia, 0, 0, this._t.w, this._t.h, 0, 0, 1, 1);
        const copre = area >= 0.98 * geo.w * geo.h;
        const d = this.diag;
        d.sx = geo.sx; d.sy = geo.sy; d.w = geo.w; d.h = geo.h; d.fw = fw; d.fh = fh; d.area = area; d.rett = rett;
        d.clip = clip ? 1 : 0; d.nuova = nuova ? 1 : 0; d.copre = copre ? 1 : 0;
        if (copre)
            this._valida = true;
        else if (nuova)
            this._valida = false;
        if (!copre && (rett || nuova) && this._codaPittura !== _pittureVista - 1) {
            this._codaPittura = _pittureVista;
            attore.queue_redraw();
        }
    }

    /** Una comparsa nuova della superficie (chiusura 3): la cattura di prima non vale più (la texture resta allocata); la
     *  prossima pittura rifà una cattura intera, o chiede il ridisegno intero del fotogramma dopo. */
    dimenticaCattura() {
        this._valida = false;
    }

    /** Per le prove e per l'adattamento: la texture della cattura (null se non c'è). */
    get texture() {
        return this._t && this._valida ? this._t.tex : null;
    }

    /** L'ombra portata sta fuori dall'allocazione: il volume di pittura la comprende (Clutter non la ritaglia, l'offscreen
     *  del popup la contiene). */
    vfunc_modify_paint_volume(volume) {
        const m = this.margineOmbra, a = this.get_actor();
        if (m > 0 && a) {
            _scatolaVolume.init(-m, -m, a.width + m, a.height + m);
            volume.union_box(_scatolaVolume);
        }
        return true;
    }

    /** Rilascia texture e pipeline subito (le chiama _stacca dopo remove_effect). Niente vfunc_set_actor in JS: alla
     *  chiusura della Shell gli attori finalizzati dal GC staccano gli effetti, e una vfunc JS chiamata durante il GC è
     *  un Gjs-CRITICAL (4 nella corsa c2-rapidi-dopo, 04.11 09:53); un effetto nostro non si riattacca mai ad altri. */
    rilascia() {
        this._t = null;
        this._valida = false;
        this.ultimaGeometria = null;
        this.vistaCattura = null;
    }
});
