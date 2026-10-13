/* =========================================================
   Motor del agente: ejecuta Prolog de verdad con Tau Prolog
   y obtiene una traza de la resolución (qué cláusula se
   probó, cuál unificó, cuándo hubo retroceso).
   Funciona en el navegador (window.pl) y en Node (pruebas).
   ========================================================= */
(function (raiz) {
  "use strict";
  const pl = raiz.pl;
  const LIBRERIAS = ":- use_module(library(lists)).\n:- use_module(library(format)).\n:- use_module(library(charsio)).\n";
  const LIMITE_PASOS = 20000;   // inferencias por respuesta antes de declarar posible bucle infinito
  const MAX_SOLUCIONES = 10;

  /* ---------- Separar el texto en cláusulas ----------
     Respeta comillas, comentarios, números con punto (3.14),
     operadores como =.. y caracteres 0'c. */
  function separarClausulas(texto) {
    const clausulas = [];
    let actual = "", i = 0, linea = 1, lineaInicio = 1, inicio = 0;
    const simbolo = c => "+-*/\\^<>=~:.?@#&$".includes(c);
    const n = texto.length;
    while (i < n) {
      const c = texto[i], sig = texto[i + 1];
      if (!actual.trim()) { lineaInicio = linea; if (!/\s/.test(c)) inicio = i; }
      if (c === "%") { // comentario de línea
        while (i < n && texto[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && sig === "*") { // comentario de bloque
        i += 2;
        while (i < n && !(texto[i] === "*" && texto[i + 1] === "/")) { if (texto[i] === "\n") linea++; i++; }
        i += 2;
        continue;
      }
      if (c === "0" && sig === "'" && !/[A-Za-z0-9_]/.test(texto[i - 1] || "")) { // 0'c
        actual += texto.slice(i, i + 3); i += 3;
        if (texto[i - 1] === "\\") { actual += texto[i]; i++; }
        continue;
      }
      if (c === "'" || c === '"' || c === "`") { // cadenas y átomos entre comillas
        const q = c; actual += c; i++;
        while (i < n) {
          const d = texto[i];
          actual += d; i++;
          if (d === "\n") linea++;
          if (d === "\\" && i < n) { actual += texto[i]; i++; continue; }
          if (d === q) { if (texto[i] === q) { actual += q; i++; continue; } break; }
        }
        continue;
      }
      if (c === "\n") linea++;
      if (c === "." && (i + 1 >= n || /\s|%/.test(sig)) && !simbolo(texto[i - 1] || " ")) {
        const t = actual.trim();
        if (t) clausulas.push({ texto: t, linea: lineaInicio, inicio, fin: i + 1 });
        actual = ""; i++;
        continue;
      }
      actual += c; i++;
    }
    if (actual.trim()) clausulas.push({ texto: actual.trim(), linea: lineaInicio, sinPunto: true, inicio, fin: n });
    return clausulas;
  }

  /** Divide la entrada en programa (hechos y reglas) y consultas (?- ...). */
  function separarEntrada(texto) {
    const clausulas = separarClausulas(texto);
    const programa = [], consultas = [];
    // El texto que recibe el intérprete conserva las líneas originales (las consultas
    // se dejan en blanco), así los errores de sintaxis señalan la línea correcta del editor.
    let programaTexto = "", pos = 0;
    const blanco = s => s.replace(/[^\n]/g, " ");
    clausulas.forEach(c => {
      programaTexto += texto.slice(pos, c.inicio);
      const original = texto.slice(c.inicio, c.fin);
      if (/^\?-/.test(c.texto)) {
        consultas.push({ texto: c.texto.replace(/^\?-\s*/, ""), linea: c.linea });
        programaTexto += blanco(original);
      } else {
        // ":- dynamic p/1." (estilo SWI) → ":- dynamic(p/1)." que es lo que acepta Tau Prolog
        const m = c.texto.match(/^:-\s*(dynamic|discontiguous|multifile)\s+([^(][\s\S]*)$/);
        const c2 = m ? { ...c, texto: `:- ${m[1]}((${m[2]}))` } : c;
        programa.push(c2);
        programaTexto += m ? c2.texto + "." + "\n".repeat((original.match(/\n/g) || []).length) : original;
      }
      pos = c.fin;
    });
    programaTexto += texto.slice(pos);
    return { programa, consultas, programaTexto, incompleta: clausulas.find(c => c.sinPunto) || null };
  }

  /** Reemplaza el corte (!) por true fuera de comillas: sirve para comparar "con y sin corte". */
  function quitarCortes(texto) {
    let out = "", q = null;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (q) { out += c; if (c === "\\") { out += texto[++i] || ""; } else if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; out += c; continue; }
      if (c === "%") { while (i < texto.length && texto[i] !== "\n") out += texto[i++]; out += "\n"; continue; }
      if (c === "!" ) { out += "true"; continue; }
      out += c;
    }
    return out;
  }

  const tieneCorte = texto => quitarCortes(texto) !== texto;

  /* ---------- Sesiones de Tau Prolog ---------- */
  function crearSesion(salida) {
    const s = pl.create(LIMITE_PASOS);
    // Captura lo que el programa escribe con write/1, nl/0, format/2…
    s.streams.user_output.stream = { put(texto) { salida.push(texto); return true; }, flush() { return true; } };
    return s;
  }

  const consultar = (s, texto) => new Promise(res => s.consult(texto, {
    success: () => res(null),
    error: e => res(e),
  }));

  const consultaPrep = (s, texto) => new Promise(res => s.query(texto, {
    success: () => res(null),
    error: e => res(e),
  }));

  const siguiente = s => new Promise(res => s.answer({
    success: a => res({ tipo: "ok", a }),
    fail: () => res({ tipo: "falla" }),
    error: e => res({ tipo: "error", e }),
    limit: () => res({ tipo: "limite" }),
  }));

  /** Término a texto. Las variables internas (_123, __177) se renombran _A, _B… dentro de cada texto. */
  function aTexto(s, t) {
    const txt = t && t.toString ? t.toString({ session: s, quoted: true }) : String(t);
    const nombres = {};
    let k = 0;
    return txt.replace(/(?<![A-Za-z0-9_])_+\d+/g, v => (nombres[v] ||= "_" + String.fromCharCode(65 + (k++ % 26))));
  }

  /** Predicados definidos por el usuario en la sesión (nombre/aridad → número de cláusulas). */
  function predicadosUsuario(s) {
    const r = s.modules.user.rules;
    return Object.keys(r).filter(k => !k.startsWith("$")).map(k => {
      const i = k.lastIndexOf("/");
      return { clave: k, nombre: k.slice(0, i), aridad: Number(k.slice(i + 1)), clausulas: r[k].length };
    });
  }

  /** Ejecuta una consulta y devuelve sus soluciones reales. */
  async function ejecutar(programaTexto, consulta) {
    const salida = [];
    const s = crearSesion(salida);
    await consultar(s, LIBRERIAS);
    const errCons = await consultar(s, programaTexto);
    if (errCons) return { estado: "error_programa", error: errCons, errorTexto: aTexto(s, errCons), salida: salida.join(""), sesion: s };
    const predicados = predicadosUsuario(s);
    const errQ = await consultaPrep(s, consulta.trim().replace(/\.?\s*$/, "."));
    if (errQ) return { estado: "error_consulta", error: errQ, errorTexto: aTexto(s, errQ), salida: salida.join(""), predicados, sesion: s };

    const soluciones = [];
    let fin = null;
    while (soluciones.length < MAX_SOLUCIONES) {
      const r = await siguiente(s);
      if (r.tipo === "ok") soluciones.push({ texto: s.format_answer(r.a).replace(/(?<![A-Za-z0-9_])_+\d+/g, "_") });
      else { fin = r; break; }
    }
    const res = { soluciones, salida: salida.join(""), predicados, sesion: s };
    if (!fin) { res.estado = "ok"; res.hayMas = true; }
    else if (fin.tipo === "falla") res.estado = soluciones.length ? "ok" : "falla";
    else if (fin.tipo === "limite") res.estado = soluciones.length ? "ok_limite" : "limite";
    else { res.estado = soluciones.length ? "ok_error" : "error"; res.error = fin.e; res.errorTexto = aTexto(s, fin.e); }
    return res;
  }

  /* ---------- Meta-intérprete para la traza ----------
     Registra cada paso con '$reg'/1 (assertz sobrevive al retroceso,
     así queda también el historial de los caminos que fallaron). */
  const META = String.raw`
:- dynamic('$evento'/2).
:- dynamic('$pasos'/1).
'$pasos'(0).
'$reg'(E) :- retract('$pasos'(N)), N1 is N + 1, assertz('$pasos'(N1)), ( N1 =< 400 -> assertz('$evento'(N1, E)) ; true ).
'$usuario'(G) :- callable(G), functor(G, N, A), '$def'(N, A).
'$resolver'(G, _) :- var(G), !, throw(error(instantiation_error, call/1)).
'$resolver'(true, _) :- !.
'$resolver'((A, B), P) :- !, '$resolver'(A, P), '$resolver'(B, P).
'$resolver'((C -> T ; E), P) :- !, ( '$resolver'(C, P) -> '$reg'(condicion(P, C, si)), '$resolver'(T, P) ; '$reg'(condicion(P, C, no)), '$resolver'(E, P) ).
'$resolver'((C -> T), P) :- !, ( '$resolver'(C, P) -> '$reg'(condicion(P, C, si)), '$resolver'(T, P) ; '$reg'(condicion(P, C, no)), fail ).
'$resolver'((A ; B), P) :- !, ( '$reg'(alternativa(P, 1, A)), '$resolver'(A, P) ; '$reg'(alternativa(P, 2, B)), '$resolver'(B, P) ).
'$resolver'(\+ A, P) :- !, ( '$resolver'(A, P) -> '$reg'(negacion(P, A, falla)), fail ; '$reg'(negacion(P, A, exito)) ).
'$resolver'(not(A), P) :- !, '$resolver'(\+ A, P).
'$resolver'(G, P) :- '$usuario'(G), P >= 60, !, '$reg'(limite(P, G)), fail.
'$resolver'(G, P) :- '$usuario'(G), !, P1 is P + 1, '$reg'(llamada(P1, G)), ( '$clausulas'(G, P1) ; '$reg'(agotado(P1, G)), fail ).
'$resolver'(G, P) :- '$reg'(predef_inicio(P, G)), ( catch(call(G), Err, ('$reg'(error(P, G, Err)), throw(Err))), '$reg'(predef(P, G, si)) ; '$reg'(predef(P, G, no)), fail ).
% Primer argumento que impide la unificación (se calcula sobre copias, sin ligar nada)
'$arg_falla'(G, H, K, AG, AH) :- copy_term(G-H, G1-H1), G1 =.. [_|As], H1 =.. [_|Bs], ( '$pa'(As, Bs, 1, K, AG, AH) -> true ; K = 0, AG = G, AH = H ).
'$pa'([A|As], [B|Bs], N, K, AG, AH) :- ( A = B -> N1 is N + 1, '$pa'(As, Bs, N1, K, AG, AH) ; K = N, AG = A, AH = B ).
'$clausulas'(G, P) :- functor(G, N, A), functor(H0, N, A), findall(H0-B0, clause(H0, B0), Cs), '$probar'(Cs, 1, G, P).
'$probar'([H-B|R], I, G, P) :-
    (   \+ H = G
    ->  '$arg_falla'(G, H, K, AG, AH), '$reg'(no_unifica(P, I, G, H, K, AG, AH)), I1 is I + 1, '$probar'(R, I1, G, P)
    ;   (   G = H, '$reg'(unifica(P, I, G, B)), '$resolver'(B, P)
        ;   '$reg'(retroceso(P, I, G)), I1 is I + 1, '$probar'(R, I1, G, P)
        )
    ).
`;

  const comillar = nombre => (/^[a-z][A-Za-z0-9_]*$/.test(nombre) ? nombre : "'" + nombre.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'");

  // posición de la meta dentro de cada tipo de evento (para saber a qué predicado pertenece)
  const POS_META = { llamada: 1, no_unifica: 2, unifica: 2, retroceso: 2, agotado: 1, limite: 1 };

  function terminoAEvento(s, t) {
    const args = (t.args || []).map(a => aTexto(s, a));
    const ev = { tipo: t.id, args };
    const pos = POS_META[t.id];
    if (pos !== undefined && t.args[pos]) {
      const g = t.args[pos];
      ev.pi = `${g.id}/${(g.args || []).length}`;
      ev.nombre = g.id;
    }
    if (t.args && t.args[0] && t.args[0].value !== undefined) ev.nivel = Number(t.args[0].value);
    return ev;
  }

  /** Obtiene la traza de la primera solución (o de la búsqueda completa si falla). */
  async function trazar(programaTexto, consulta) {
    const salida = [];
    const s = crearSesion(salida);
    await consultar(s, LIBRERIAS);
    if (await consultar(s, programaTexto)) return null;
    const preds = predicadosUsuario(s);
    preds.forEach(p => { s.modules.user.public_predicates[p.clave] = true; }); // permite clause/2
    const defs = preds.map(p => `'$def'(${comillar(p.nombre)}, ${p.aridad}).`).join("\n");
    if (await consultar(s, META + "\n" + defs)) return null;
    let resultado = "falla";
    if (!(await consultaPrep(s, `'$resolver'((${consulta.trim().replace(/\.\s*$/, "")}), 0).`))) {
      const r = await siguiente(s);
      resultado = r.tipo === "ok" ? "exito" : r.tipo === "falla" ? "falla" : r.tipo;
    } else resultado = "error";
    const eventos = [];
    if (!(await consultaPrep(s, "'$evento'(N, E)."))) {
      for (let k = 0; k < 400; k++) {
        const r = await siguiente(s);
        if (r.tipo !== "ok") break;
        eventos.push(terminoAEvento(s, r.a.links.E));
      }
    }
    let total = 0;
    if (!(await consultaPrep(s, "'$pasos'(N)."))) {
      const r = await siguiente(s);
      if (r.tipo === "ok") total = Number(r.a.links.N.value);
    }
    return { resultado, eventos, total, sesion: s };
  }

  raiz.Motor = { separarClausulas, separarEntrada, quitarCortes, tieneCorte, ejecutar, trazar, aTexto, MAX_SOLUCIONES };
})(typeof window !== "undefined" ? window : globalThis);
