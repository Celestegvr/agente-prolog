/* =========================================================
   Explicador del agente: convierte el resultado real y la
   traza de resolución en una explicación en español, detecta
   los temas del programa y da notas y advertencias.
   ========================================================= */
(function (raiz) {
  "use strict";

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cod = s => `<code>${esc(s)}</code>`;

  /* ---------- Cláusulas del programa: cabeza, nombre/aridad ---------- */
  function contarArgs(s) {
    // cuenta argumentos de nivel superior dentro de "(...)"
    let nivel = 0, n = 1, q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if ("([{".includes(c)) nivel++;
      else if (")]}".includes(c)) nivel--;
      else if (c === "," && nivel === 0) n++;
    }
    return s.trim() ? n : 0;
  }

  function cabeza(texto) {
    const t = texto.trim();
    if (t.startsWith(":-")) return null; // directiva
    const i = buscarFuera(t, ":-");
    const h = (i >= 0 ? t.slice(0, i) : t).trim();
    const m = h.match(/^([a-z][A-Za-z0-9_]*|'(?:[^'\\]|\\.)*')\s*(\(([\s\S]*)\))?\s*$/);
    if (!m) return null;
    const nombre = m[1].startsWith("'") ? m[1].slice(1, -1) : m[1];
    const aridad = m[2] ? contarArgs(m[3]) : 0;
    return { nombre, aridad, pi: `${nombre}/${aridad}`, esRegla: i >= 0, cabeza: h, cuerpo: i >= 0 ? t.slice(i + 2).trim() : "" };
  }

  function buscarFuera(t, sub) {
    let q = null;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (t.startsWith(sub, i)) return i;
    }
    return -1;
  }

  /** Quita el contenido entre comillas y los comentarios para analizar símbolos sin falsos positivos. */
  function limpio(t) {
    return t.replace(/%[^\n]*/g, "").replace(/'(?:[^'\\]|\\.)*'/g, "'a'").replace(/"(?:[^"\\]|\\.)*"/g, '"s"');
  }

  function indexar(clausulas) {
    const porPred = {};
    clausulas.forEach(c => {
      const h = cabeza(c.texto);
      if (!h) return;
      (porPred[h.pi] ||= []).push({ ...h, texto: c.texto, linea: c.linea });
    });
    return porPred;
  }

  /* ---------- Variables y advertencias ---------- */
  function variablesDe(texto) {
    return (limpio(texto).match(/(?<![A-Za-z0-9_'])[A-Z_][A-Za-z0-9_]*/g) || []);
  }

  function advertencias(clausulas, consultas) {
    const av = [];
    clausulas.forEach(c => {
      const h = cabeza(c.texto);
      const vars = variablesDe(c.texto).filter(v => v !== "_");
      const cuenta = {};
      vars.forEach(v => (cuenta[v] = (cuenta[v] || 0) + 1));
      const solas = Object.keys(cuenta).filter(v => cuenta[v] === 1 && !v.startsWith("_"));
      if (solas.length) av.push(`Línea ${c.linea}: variable${solas.length > 1 ? "s" : ""} singleton ${solas.map(cod).join(", ")} en ${h ? cod(h.pi) : "la cláusula"}. Se usa una sola vez; si su valor no importa, escribe ${cod("_")} (variable anónima).`);
    });
    // Corte rojo: una cláusula anterior tiene "!" y la última no vuelve a comprobar la condición
    Object.entries(indexar(clausulas)).forEach(([pi, cs]) => {
      if (cs.length < 2) return;
      const conCorte = cs.slice(0, -1).some(c => /!/.test(limpio(c.cuerpo)));
      const ultima = cs[cs.length - 1];
      const compara = /(=<|>=|<|>|=:=|=\\=|\\\+|\\==|\\=)/.test(limpio(ultima.cuerpo));
      if (conCorte && !compara) av.push(`${cod(pi)} usa un <b>corte rojo</b>: la última cláusula (${cod(ultima.texto)}) no repite la condición y solo es correcta gracias al ${cod("!")}. Si se consulta con el resultado ya dado${pi === "max/3" ? `, por ejemplo ${cod("max(5, 3, 3)")},` : ""} puede responder ${cod("true")} aunque no sea lo esperado, porque el corte nunca llega a ejecutarse. Alternativa: ${cod("( Condición -> A ; B )")} o repetir la condición negada.`);
    });
    const todo = limpio(clausulas.map(c => c.texto).concat(consultas.map(q => q.texto)).join("\n"));
    if (/<=/.test(todo.replace(/=<|<=>/g, ""))) av.push(`Se escribió ${cod("<=")}: en Prolog el menor o igual se escribe ${cod("=<")}.`);
    if (/=>/.test(todo.replace(/>=|=>/g, m => (m === ">=" ? "" : m)))) av.push(`Se escribió ${cod("=>")}: el mayor o igual se escribe ${cod(">=")}.`);
    consultas.forEach(q => {
      const m = limpio(q.texto).match(/(?<![A-Za-z0-9_])([A-Z][A-Za-z0-9_]*)\s*=\s*[^,=]*[+\-*/][^,]*/);
      if (m && !/\bis\b/.test(q.texto)) av.push(`En ${cod(q.texto)} se usa ${cod("=")} con una expresión: ${cod("=")} solo unifica, no calcula. Para calcular usa ${cod(m[1] + " is ...")}.`);
    });
    return av;
  }

  /* ---------- Temas que trata el programa ---------- */
  function temas(clausulas, consultas, predicados) {
    const t = [];
    const prog = limpio(clausulas.map(c => c.texto).join("\n"));
    const todo = prog + "\n" + limpio(consultas.map(q => q.texto).join("\n"));
    const idx = indexar(clausulas);
    const hechos = clausulas.filter(c => { const h = cabeza(c.texto); return h && !h.esRegla; }).length;
    const reglas = clausulas.filter(c => { const h = cabeza(c.texto); return h && h.esRegla; }).length;

    if (hechos || reglas) {
      const lista = Object.entries(idx).map(([pi, cs]) => `${cod(pi)} (${cs.length} cláusula${cs.length > 1 ? "s" : ""})`).join(", ");
      const mismos = Object.keys(idx).map(pi => pi.split("/")[0]).filter((n, i, a) => a.indexOf(n) !== i);
      t.push({ id: "clausulas", titulo: "Hechos, reglas y predicados",
        detalle: `El programa tiene <b>${hechos}</b> hecho${hechos === 1 ? "" : "s"} y <b>${reglas}</b> regla${reglas === 1 ? "" : "s"}. Predicados: ${lista}. Un hecho no tiene cuerpo (siempre es verdadero); una regla ${cod("Cabeza :- Cuerpo")} es verdadera si se cumple su cuerpo. La notación ${cod("nombre/aridad")} indica cuántos argumentos tiene.${mismos.length ? ` Ojo: ${cod(mismos[0])} aparece con distinta aridad, son predicados diferentes.` : ""}` });
    }
    const recursivos = Object.entries(idx).filter(([pi, cs]) => cs.some(c => c.esRegla && new RegExp(`(?<![A-Za-z0-9_])${pi.split("/")[0].replace(/[$]/g, "\\$")}\\s*\\(`).test(c.cuerpo))).map(([pi]) => pi);
    if (recursivos.length) t.push({ id: "recursion", titulo: "Recursión",
      detalle: `${recursivos.map(cod).join(", ")} se llama a sí mismo. Siempre debe existir un <b>caso base</b> (una cláusula que no se llama a sí misma) y la llamada recursiva debe acercarse a él, por ejemplo avanzando por la cola de una lista.` });
    if (/\b(atom|number|integer|float|var|nonvar|compound|atomic|is_list|callable|string)\s*\(/.test(todo) || /[a-z]\w*\([^()]*[a-z]\w*\(/.test(prog)) t.push({ id: "tipos", titulo: "Tipos de datos",
      detalle: `En Prolog todo es un <b>término</b>: átomos (${cod("ana")}), números (${cod("7")}, ${cod("3.14")}), variables (${cod("X")}) y estructuras (${cod("punto(2,3)")}). ${cod("atom/1")}, ${cod("number/1")}, ${cod("integer/1")}, ${cod("var/1")}, ${cod("compound/1")} e ${cod("is_list/1")} comprueban el tipo antes de razonar.` });
    const vars = new Set(variablesDe(todo));
    if (vars.size) t.push({ id: "variables", titulo: "Variables",
      detalle: `Variables: ${[...vars].filter(v => v !== "_").slice(0, 12).map(cod).join(", ") || "solo anónimas"}${vars.has("_") ? ` y la anónima ${cod("_")}` : ""}. Empiezan con mayúscula o ${cod("_")}; se <b>ligan por unificación</b> y no se reasignan: si una rama falla, el retroceso deshace la ligadura. Cada ${cod("_")} es independiente.` });
    if (/\bis\b|=:=|=\\=|(?<![=<\\])<(?!=)|(?<![-=])>(?!=)|=<|>=|\bmod\b|\/\/|\*\*|\bsqrt\b|\babs\b/.test(todo)) t.push({ id: "aritmetica", titulo: "Operadores aritméticos",
      detalle: `${cod("X is Expr")} <b>evalúa</b> la expresión y liga ${cod("X")}; ${cod("=:=")} y ${cod("=\\=")} comparan valores; ${cod("<")}, ${cod(">")}, ${cod("=<")}, ${cod(">=")} comparan números. ${cod("=")} solo unifica (${cod("X = 2+3")} deja el término ${cod("2+3")}). ${cod("//")} es división entera y ${cod("mod")} el resto. Los operandos deben estar ligados; si no, hay error de instanciación.` });
    if (/\[/.test(todo)) t.push({ id: "listas", titulo: "Listas",
      detalle: `Una lista es ${cod("[]")} (vacía) o ${cod("[Cabeza|Cola]")}. Los predicados sobre listas suelen tener un caso base con ${cod("[]")} y un caso recursivo que procesa la cabeza y sigue con la cola. Hay predefinidos como ${cod("member/2")}, ${cod("append/3")}, ${cod("length/2")}, ${cod("nth0/3")}, ${cod("reverse/2")} y ${cod("sum_list/2")}.` });
    if (/\\\+|\bnot\s*\(/.test(todo)) t.push({ id: "negacion", titulo: "Negación como fallo",
      detalle: `${cod("\\+ Meta")} tiene éxito si <b>no se puede demostrar</b> ${cod("Meta")} con lo que hay en el programa (hipótesis del mundo cerrado). No significa "falso en el mundo real", sino "no consta". No liga variables: conviene usarla con variables ya ligadas.` });
    if (/;/.test(todo)) t.push({ id: "disyuncion", titulo: "Disyunción",
      detalle: `${cod("A ; B")} se lee "A o B": Prolog prueba primero ${cod("A")} y, si falla o se piden más soluciones, prueba ${cod("B")}. Equivale a escribir dos cláusulas para el mismo predicado.` });
    if (/->/.test(todo)) t.push({ id: "sientonces", titulo: "Si-entonces-si no",
      detalle: `${cod("( Cond -> Entonces ; SiNo )")} evalúa ${cod("Cond")} una sola vez: si se cumple ejecuta ${cod("Entonces")}, si no ${cod("SiNo")}. Es la <b>alternativa limpia al corte</b> para elegir entre casos.` });
    if (/!/.test(prog + todo)) t.push({ id: "corte", titulo: "Corte (!)",
      detalle: `El corte ${cod("!")} siempre se cumple, pero <b>poda</b>: descarta las cláusulas restantes del predicado y las alternativas de las metas anteriores en la misma cláusula. Un corte <i>verde</i> solo evita trabajo; uno <i>rojo</i> cambia las respuestas. Alternativas: ${cod("( C -> A ; B )")}, ${cod("\\+")} y ${cod("once/1")}.` });
    if (/\b(assert|asserta|assertz|retract)\s*\(/.test(todo)) t.push({ id: "dinamicos", titulo: "Predicados dinámicos",
      detalle: `${cod("assert/1")} añade cláusulas en ejecución y ${cod("retract/1")} las elimina (declara ${cod(":- dynamic nombre/aridad.")}). Sirve como memoria de un agente, pero resta pureza declarativa.` });
    if (/\b(write|print|nl|format|writeln)\b/.test(todo)) t.push({ id: "salida", titulo: "Entrada y salida",
      detalle: `${cod("write/1")}, ${cod("nl/0")} y ${cod("format/2")} son predicados con efecto: escriben en la salida y siempre se cumplen.` });
    return t;
  }

  /* ---------- Errores en español ---------- */
  function traducirError(texto, offsetLinea = 0) {
    const t = String(texto || "");
    let m;
    if (/instantiation_error/.test(t)) return { titulo: "Error de instanciación", detalle: `Se usó una variable <b>libre</b> (sin valor) donde se necesitaba un valor, por ejemplo en ${cod("Y is X + 1")} sin saber cuánto vale ${cod("X")}. Revisa el orden de las submetas: primero liga la variable, luego calcula.` };
    if ((m = t.match(/existence_error\(procedure,\s*([^)]*?\/\d+)\)/))) return { titulo: "Predicado no definido", detalle: `El predicado ${cod(m[1].replace(/^'|'(?=\/)/g, ""))} no existe: no hay hechos ni reglas con ese nombre y aridad. Revisa la ortografía y el número de argumentos.` };
    if ((m = t.match(/type_error\(evaluable,\s*([^)]*)\)/))) return { titulo: "Expresión aritmética no válida", detalle: `${cod(m[1])} no se puede evaluar con ${cod("is")}: solo se admiten números, variables ligadas a números y operadores aritméticos.` };
    if ((m = t.match(/type_error\((\w+),\s*([^)]*)\)/))) return { titulo: "Error de tipo", detalle: `Se esperaba un dato de tipo ${cod(m[1])} y llegó ${cod(m[2])}.` };
    if (/evaluation_error\(zero_divisor\)/.test(t)) return { titulo: "División entre cero", detalle: "La expresión aritmética divide entre cero." };
    if (/syntax_error/.test(t)) {
      const linea = t.match(/line\((\d+)\)/);
      const tok = t.match(/found\(([^)]*)\)/);
      return { titulo: "Error de sintaxis", detalle: `El texto no es Prolog válido${linea ? ` cerca de la línea ${Number(linea[1]) + offsetLinea}` : ""}${tok ? ` (se encontró ${cod(tok[1])})` : ""}. Revisa que cada cláusula termine en punto, que los paréntesis y corchetes estén balanceados y que las variables empiecen con mayúscula.` };
    }
    if (/permission_error/.test(t)) return { titulo: "Error de permiso", detalle: `Se intentó modificar o consultar un predicado protegido. Si usas ${cod("assert/retract")}, declara el predicado con ${cod(":- dynamic nombre/aridad.")}` };
    return { titulo: "Error", detalle: esc(t.replace(/^throw\(|\)$/g, "")) };
  }

  /* ---------- La respuesta ---------- */
  function respuesta(r) {
    if (r.estado === "error_programa") return { texto: "ERROR (el programa no se pudo cargar).", tipo: "error", error: traducirError(r.errorTexto) };
    if (r.estado === "error_consulta") return { texto: "ERROR (la consulta no es válida).", tipo: "error", error: traducirError(r.errorTexto, r.offsetLinea || 0) };
    if (r.estado === "limite") return { texto: "No termina: se superó el límite de pasos.", tipo: "limite",
      error: { titulo: "Posible recursión infinita", detalle: "La búsqueda no llegó a una respuesta tras miles de pasos. Suele pasar cuando falta el caso base o la llamada recursiva no se acerca a él." } };
    if (r.estado === "falla") return { texto: "false.", tipo: "falla" };
    if (r.estado === "error") return { texto: "ERROR.", tipo: "error", error: traducirError(r.errorTexto) };
    const sols = r.soluciones.map(s => s.texto);
    let texto = sols.every(s => s === "true") ? (sols.length > 1 ? sols.join(" ;\n") + "." : "true.") : sols.join(" ;\n") + ".";
    const notas = [];
    if (r.hayMas) notas.push(`Se muestran las primeras ${sols.length} soluciones; puede haber más.`);
    if (r.estado === "ok_limite") notas.push("Después de estas soluciones la búsqueda no termina (posible bucle).");
    if (r.estado === "ok_error") notas.push("Después de estas soluciones ocurrió un error: " + traducirError(r.errorTexto).titulo + ".");
    return { texto, tipo: "ok", notas };
  }

  /* ---------- Narración de la traza ---------- */
  function narrar(traza, clausulas) {
    if (!traza || !traza.eventos.length) return [];
    const idx = indexar(clausulas);
    const pasos = [];
    const abiertos = {}; // predef_inicio pendientes por nivel
    const textoClausula = (pi, i) => (idx[pi] && idx[pi][i - 1] ? idx[pi][i - 1].texto : null);
    const recursiva = (pi, cuerpo) => new RegExp(`(?<![A-Za-z0-9_])${pi.split("/")[0]}\\s*\\(`).test(cuerpo);

    traza.eventos.forEach(e => {
      const a = e.args, n = e.nivel || 0;
      switch (e.tipo) {
        case "llamada":
          pasos.push({ n, clase: "meta", html: `Se quiere demostrar ${cod(a[1])}.` });
          break;
        case "no_unifica": {
          const c = textoClausula(e.pi, Number(a[1]));
          const k = Number(a[4]);
          const porque = k > 0
            ? `el argumento ${k} ${cod(a[5])} no encaja con ${cod(a[6])}${a[6] !== a[5] && /^\[/.test(a[6]) && /^\[/.test(a[5]) ? " (las listas no coinciden)" : ""}`
            : "sus argumentos no encajan";
          pasos.push({ n, clase: "no", html: `La cláusula ${a[1]} de ${cod(e.pi)}${c ? ` (${cod(c)})` : ""} <b>no unifica</b> con ${cod(a[2])}: ${porque}. Se descarta.` });
          break;
        }
        case "unifica": {
          const c = textoClausula(e.pi, Number(a[1]));
          const cuerpo = a[3];
          const det = cuerpo === "true"
            ? "es un <b>hecho</b>, así que se cumple de inmediato."
            : `es una regla: ahora hay que demostrar su cuerpo ${cod(cuerpo)}${recursiva(e.pi, cuerpo) ? " (llamada recursiva: el problema se reduce)" : ""}.`;
          pasos.push({ n, clase: "si", html: `La cláusula ${a[1]} de ${cod(e.pi)}${c ? ` (${cod(c)})` : ""} <b>unifica</b> con ${cod(a[2])}; ${det}` });
          break;
        }
        case "retroceso":
          pasos.push({ n, clase: "retro", html: `El camino por la cláusula ${a[1]} no llevó a una solución: <b>retroceso</b> (backtracking), se deshacen las ligaduras y se prueba la siguiente cláusula de ${cod(e.pi)}.` });
          break;
        case "agotado":
          pasos.push({ n, clase: "no", html: `No quedan más cláusulas de ${cod(e.pi)} para ${cod(a[1])}: esta meta <b>falla</b>.` });
          break;
        case "limite":
          pasos.push({ n, clase: "no", html: `Se alcanzó el límite de profundidad en ${cod(a[1])}: posible recursión infinita.` });
          break;
        case "predef_inicio":
          (abiertos[n] ||= []).push({ exito: false, antes: a[1] });
          break;
        case "predef": {
          const g = a[1];
          const pila = abiertos[n] || [];
          const tope = pila[pila.length - 1];
          if (a[2] === "si") {
            if (tope) tope.exito = true;
            pasos.push({ n, clase: "si", html: describirPredef(g, true, tope && tope.antes) });
          } else {
            const t = pila.pop();
            const tuvoExito = t ? t.exito : false;
            pasos.push({ n, clase: tuvoExito ? "retro" : "no", html: tuvoExito ? `${cod(g)} no tiene más soluciones: se retrocede.` : describirPredef(g, false, t && t.antes) });
          }
          break;
        }
        case "error":
          pasos.push({ n, clase: "no", html: `Al ejecutar ${cod(a[1])} ocurre un error: ${traducirError(a[2]).titulo.toLowerCase()}.` });
          break;
        case "negacion":
          pasos.push({ n, clase: a[2] === "exito" ? "si" : "no", html: a[2] === "exito"
            ? `${cod("\\+ " + a[1])} <b>tiene éxito</b>: ${cod(a[1])} no se pudo demostrar (negación como fallo).`
            : `${cod("\\+ " + a[1])} <b>falla</b> porque ${cod(a[1])} sí se pudo demostrar.` });
          break;
        case "alternativa":
          pasos.push({ n, clase: "meta", html: a[1] === "1" ? `Disyunción: se prueba la primera alternativa ${cod(a[2])}.` : `La primera alternativa no dio solución; se prueba la segunda ${cod(a[2])}.` });
          break;
        case "condicion":
          pasos.push({ n, clase: a[2] === "si" ? "si" : "no", html: a[2] === "si" ? `La condición ${cod(a[1])} se cumple: se toma la rama <b>entonces</b>.` : `La condición ${cod(a[1])} no se cumple: se toma la rama <b>si no</b>.` });
          break;
      }
    });
    return pasos;
  }

  function describirPredef(g, exito, antes) {
    let m;
    // unificación con variables: se muestra cómo estaba antes y cómo quedó
    if (exito && antes && antes !== g && /^[^=<>\\]+?\s*=\s*[^=:\\]/.test(antes) && !/\bis\b/.test(antes)) return `Se unifica ${cod(antes)} → ${cod(g)}: las variables quedan ligadas.`;
    // Tau imprime los operadores con o sin espacios (3>0, e=a, X is 3+4)
    if ((m = g.match(/^(.+?) is (.+)$/))) return exito ? `Se calcula ${cod(m[2])} con ${cod("is")}: el resultado es ${cod(m[1])}.` : `${cod(g)} no se cumple: el valor calculado no coincide.`;
    if (/^[^\[(]*?(\\==|==)/.test(g)) return `${cod(g)} ${exito ? "<b>se cumple</b>" : "<b>no se cumple</b>"} (comparación de identidad, sin unificar).`;
    if (/^[^\[(]*?(=:=|=\\=|=<|>=|<|>)/.test(g) && !/^[^\[(]*?(@[<>]|=\.\.)/.test(g)) return `${cod(g)} ${exito ? "<b>se cumple</b>" : "<b>no se cumple</b>"} (comparación aritmética).`;
    if ((m = g.match(/^([^=\\]+?)\s*\\=\s*(.+)$/))) return `${cod(g)}: ${exito ? "los términos <b>no unifican</b>, así que se cumple" : "los términos sí unifican, así que <b>no se cumple</b>"}.`;
    if ((m = g.match(/^([^=<>\\]+?)\s*=\s*([^=:\\].*)$/))) return exito ? `Unificación: ${cod(g)}.` : `${cod(m[1])} y ${cod(m[2])} <b>no unifican</b>.`;
    if (/^(write|print|nl|format|writeln)\b/.test(g)) return `${cod(g)} escribe en la salida.`;
    if (/^(atom|number|integer|float|var|nonvar|compound|atomic|is_list|callable)\(/.test(g)) return `Verificación de tipo ${cod(g)}: ${exito ? "<b>verdadero</b>" : "<b>falso</b>"}.`;
    return exito ? `${cod(g)} (predicado predefinido) se cumple.` : `${cod(g)} <b>no se cumple</b>.`;
  }

  /** Resumen en una o dos frases, como en el ejemplo de la tarea. */
  function resumen(r, traza, corte) {
    if (r.estado === "falla") return "No existe ninguna forma de demostrar la consulta con los hechos y reglas del programa; por eso la respuesta es false.";
    if (r.estado === "limite") return "Prolog entra en una búsqueda que no termina, así que nunca llega a responder.";
    if (/error/.test(r.estado) && !r.soluciones?.length) return "La ejecución se detuvo por un error antes de encontrar una respuesta.";
    if (!traza || !traza.eventos.length) {
      if (corte) return "La consulta se demostró; el corte del programa decide qué cláusulas se exploran (ver la comparación con y sin corte).";
      return "La consulta se demostró con los predicados predefinidos.";
    }
    const ev = traza.eventos;
    const nivel1 = ev.filter(e => e.tipo === "llamada").length;
    const descartes = ev.filter(e => e.tipo === "no_unifica").length;
    const retros = ev.filter(e => e.tipo === "retroceso").length;
    const sol = r.soluciones.length === 1 ? "la primera solución" : `la primera de ${r.soluciones.length}${r.hayMas ? "+" : ""} soluciones`;
    if (!nivel1) return `La consulta solo usa predicados predefinidos; Prolog los evaluó directamente hasta encontrar ${sol}.`;
    const partes = [];
    partes.push(`Prolog resolvió ${nivel1} meta${nivel1 === 1 ? "" : "s"} del programa`);
    if (descartes) partes.push(`descartó ${descartes} cláusula${descartes === 1 ? "" : "s"} que no unificaba${descartes === 1 ? "" : "n"}`);
    if (retros) partes.push(`retrocedió ${retros} ${retros === 1 ? "vez" : "veces"}`);
    return `${partes.join(", ")} hasta encontrar ${sol}.`;
  }

  raiz.Explicador = { respuesta, narrar, temas, advertencias, traducirError, resumen, indexar, esc, cod };
})(typeof window !== "undefined" ? window : globalThis);
