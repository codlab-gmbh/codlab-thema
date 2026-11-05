// materiale.glsl — il vetro CodLab (03.11.2026). Un solo passaggio sulla cattura di ciò che sta dietro la superficie
// (texture del livello 0 con mipmap, coordinate 0..1 sulla superficie). Unità: pixel veri del framebuffer.
// Ordine: maschera a rettangolo arrotondato → lente nella fascia del bordo (con dispersione) → sfocatura a 5 prese sul
// livello mipmap → vivacità → tinta della polarità → LIMITATORE di luminanza (garantisce il contrasto del testo della
// polarità, salvo il filo esterno di 2 px dove non c'è testo) → luce: filo che dipende dalla direzione della luce,
// riflesso morbido che la segue, ombra interna e gradiente di spessore.
// Chiusura 2 (04.11.2026): l'OMBRA PORTATA la disegna lo shader, FUORI dal vetro e sotto di lui: il quad è la superficie
// allargata di v_ombra_m px per lato. Prima era un box-shadow del foglio, e St dipinge l'ombra anche DENTRO il riquadro,
// sopra il vetro (diagnosi c2-diag-ombra, 04.11 10:20: menu rapido latteo L 0,43 con l'ombra, 0,75 senza): il latteo
// diventava grigio e il menu Accessibilità scendeva a 4,44:1.
// ---- dichiarazioni ----
uniform float v_dim_x;   // larghezza della superficie (px)
uniform float v_dim_y;   // altezza (px)
uniform float v_raggio;  // raggio degli angoli (px)
uniform float v_bordo;   // larghezza della fascia della lente (px)
uniform float v_lente;   // spostamento massimo dei campioni sul bordo (px)
uniform float v_lod;     // livello mipmap della sfocatura
uniform float v_luce_x;  // posizione della luce rispetto al centro (px; fuori dalla superficie = luce radente)
uniform float v_luce_y;
uniform float v_spec;    // forza del riflesso morbido
uniform float v_filo;    // forza del filo di luce sul bordo
uniform float v_polo;    // 0 = vetro scuro e testo chiaro, 1 = vetro chiaro e testo scuro
uniform float v_lim;     // luminanza limite (lineare): massimo col polo 0, minimo col polo 1
uniform float v_tinta;   // quanto si va verso il colore base della polarità
uniform float v_sat;     // vivacità (1 = invariata)
uniform float v_ombra;   // ombra interna e gradiente di spessore
uniform float v_pieno;   // 1 = niente cattura: solo materiale pieno (ripiego fuori da una vista)
uniform float v_strato;  // 0..1: spessore (pannelli grandi = più sfocato e più profondo)
uniform float v_ombra_m;  // margine del quad attorno alla superficie (px): 0 = niente ombra
uniform float v_ombra_a;  // opacità dell'ombra portata
uniform float v_ombra_s;  // sfocatura dell'ombra (sigma, px)
uniform float v_ombra_dy; // scostamento dell'ombra verso il basso (px)

float vetro_sd(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}
vec3 vetro_lin(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(2.2)); }
vec3 vetro_srgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
float vetro_l(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// ---- corpo ----
vec2 dim = vec2(max(v_dim_x, 1.0), max(v_dim_y, 1.0));
// coordinate sulla superficie (0..1 dentro; fuori, nel margine dell'ombra, oltre i bordi)
vec2 uv = (cogl_tex_coord0_in.st * (dim + 2.0 * v_ombra_m) - vec2(v_ombra_m)) / dim;
vec2 h = 0.5 * dim;
vec2 p = (uv - 0.5) * dim;
float r = min(v_raggio, min(h.x, h.y));
float d = vetro_sd(p, h, r);
float a = clamp(0.5 - d, 0.0, 1.0);
vec2 g = vec2(vetro_sd(p + vec2(1.0, 0.0), h, r) - vetro_sd(p - vec2(1.0, 0.0), h, r),
              vetro_sd(p + vec2(0.0, 1.0), h, r) - vetro_sd(p - vec2(0.0, 1.0), h, r));
vec2 n = g / max(length(g), 1e-4);
float dentro = max(-d, 0.0);
float banda = max(v_bordo, 1.0);
float t = clamp(1.0 - dentro / banda, 0.0, 1.0);
float curva = t * t * (1.5 - 0.5 * t);             // profilo del quarzo: piatto dentro, ripido sul bordo
vec2 px = 1.0 / dim;
vec2 sposta = -n * (v_lente * curva) * px;          // i campioni vanno verso l'interno: lo sfondo si piega
vec3 col;
if (v_pieno > 0.5) {
  col = mix(vec3(0.16, 0.16, 0.18), vec3(0.92, 0.92, 0.94), v_polo);
} else {
  float lod = v_lod + 0.6 * v_strato;
  float rg = exp2(lod) * 1.25;
  vec2 c0 = uv + sposta;
  col  = textureLod(cogl_sampler0, c0, lod).rgb * 0.36;
  col += textureLod(cogl_sampler0, c0 + vec2( rg, 0.4 * rg) * px, lod).rgb * 0.16;
  col += textureLod(cogl_sampler0, c0 + vec2(-rg, -0.4 * rg) * px, lod).rgb * 0.16;
  col += textureLod(cogl_sampler0, c0 + vec2(-0.4 * rg, rg) * px, lod).rgb * 0.16;
  col += textureLod(cogl_sampler0, c0 + vec2(0.4 * rg, -rg) * px, lod).rgb * 0.16;
  // dispersione: rosso e blu piegati un poco di più e di meno, solo nella fascia della lente
  float k = curva * 0.45;
  col.r = mix(col.r, textureLod(cogl_sampler0, uv + sposta * 1.35, lod).r, k);
  col.b = mix(col.b, textureLod(cogl_sampler0, uv + sposta * 0.70, lod).b, k);
  // vivacità (il vetro di Apple satura ciò che sta dietro)
  float l0 = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(l0), col, v_sat), 0.0, 1.0);
}
vec3 lin = vetro_lin(col);
vec3 base = mix(vec3(0.012, 0.012, 0.016), vec3(0.80, 0.81, 0.84), v_polo);
lin = mix(lin, base, v_tinta);
// luce: direzione dal centro verso la luce; il filo è più forte dal lato che la guarda
vec2 lv = vec2(v_luce_x, v_luce_y);
vec2 ld = lv / max(length(lv), 1e-3);
float guarda = max(dot(n, ld), 0.0);
float opposto = max(dot(n, -ld), 0.0);
// gradiente di spessore: in alto un poco più chiaro, in basso più scuro (profondità, non un velo uniforme)
float spessore = (uv.y - 0.5) * v_ombra;
lin *= 1.0 - 0.22 * spessore * (1.0 - v_polo) - 0.10 * spessore * v_polo;
// riflesso morbido: un lobo largo nel punto della luce (dentro la superficie), segue il puntatore
vec2 sp = clamp(lv, -h * 0.92, h * 0.92);
vec2 q = (p - sp) / max(h * vec2(1.05, 1.35), vec2(1.0));
float lobo = exp(-dot(q, q) * 2.2) * v_spec;
lin += lobo * mix(0.050, 0.090, v_polo) * vec3(1.0);
// LIMITATORE: il testo della polarità resta ≥ 4,5:1 per costruzione (v_lim lo calcola l'estensione)
float L = vetro_l(lin);
vec3 limitato = lin;
if (v_polo < 0.5) {
  if (L > v_lim) limitato = lin * (v_lim / max(L, 1e-5));
} else {
  if (L < v_lim) limitato = mix(lin, vec3(1.0), (v_lim - L) / max(1.0 - L, 1e-3));
}
float zonaTesto = smoothstep(1.6, 3.4, dentro);
lin = mix(lin, limitato, zonaTesto);
// filo di luce (fuori dalla zona del testo): sottile, continuo, più forte verso la luce; filo scuro dal lato opposto
float filo = (1.0 - smoothstep(0.0, 2.2, dentro)) * v_filo * (0.30 + 0.70 * guarda * guarda);
float ombraBordo = (1.0 - smoothstep(0.0, 3.0, dentro)) * v_ombra * 0.35 * opposto * opposto;
lin = lin * (1.0 - ombraBordo) + vec3(filo) * mix(0.55, 0.35, v_polo);
// riflesso radente sulla lente: la fascia del bordo verso la luce prende un poco della luce
lin += vec3(curva * guarda * 0.06 * v_filo) * (1.0 - zonaTesto);
vec3 fuori = vetro_srgb(lin);
// ombra portata: morbida e scostata in basso, più un filo di contatto sotto il bordo; solo dove il vetro non c'è
float ombra = 0.0;
if (v_ombra_a > 0.0) {
  float s = max(v_ombra_s, 0.5);
  float ds = max(vetro_sd(p - vec2(0.0, v_ombra_dy), h, r), 0.0);
  float dc = max(vetro_sd(p - vec2(0.0, 0.35 * v_ombra_dy), h, r), 0.0);
  ombra = v_ombra_a * exp(-0.5 * ds * ds / (s * s)) + 0.6 * v_ombra_a * exp(-0.5 * dc * dc / 4.0);
  ombra = min(ombra, 0.9);
}
cogl_color_out = (vec4(fuori * a, a) + vec4(0.0, 0.0, 0.0, ombra * (1.0 - a))) * cogl_color_in.a;
