/* =========================================================
   Interfaz del agente intérprete de Prolog
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { esc, cod } = Explicador;

  const editor = $("#codigo");
  const numeros = $("#numeros");
  let ultimo = null;           // último análisis, para el agente de IA
  let iaDisponible = false;

  /* ---------- Editor ---------- */
  function pintarNumeros() {
    const n = editor.value.split("\n").length;
    numeros.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
    numeros.scrollTop = editor.scrollTop;
  }
  editor.addEventListener("input", pintarNumeros);
  editor.addEventListener("scroll", () => (numeros.scrollTop = editor.scrollTop));
  editor.addEventListener("keydown", e => {
    if (e.key === "Tab") { // sangría con Tab
      e.preventDefault();
      const i = editor.selectionStart;
      editor.setRangeText("    ", i, editor.selectionEnd, "end");
      pintarNumeros();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
  });

  /* ---------- Ejemplos ---------- */
  function pintarEjemplos() {
    $("#ejemplos").innerHTML = EJEMPLOS.map(ej => `<button class="chip" data-ej="${ej.id}" title="${esc(ej.titulo)}"><b>${esc(ej.tema)}</b><span>${esc(ej.titulo)}</span></button>`).join("");
    $$("[data-ej]").forEach(b => b.addEventListener("click", () => {
      const ej = EJEMPLOS.find(x => x.id === b.dataset.ej);
      editor.value = ej.codigo;
      pintarNumeros();
      $$("[data-ej]").forEach(x => x.classList.toggle("activo", x === b));
      enviar();
    }));
  }

  /* ---------- Enviar al agente ---------- */
  async function enviar() {
    const texto = editor.value;
    const boton = $("#btnEnviar");
    const { programa, consultas, incompleta, programaTexto } = Motor.separarEntrada(texto);
    const salida = $("#resultado");
    if (!consultas.length) {
      salida.innerHTML = aviso("Falta la consulta", `Escribe al menos una consulta que empiece con ${cod("?-")} y termine en punto, por ejemplo ${cod("?- miembro(b, [a,b,c]).")}`);
      return;
    }
    boton.disabled = true;
    boton.innerHTML = `<span class="girando"></span>El agente está analizando…`;
    salida.innerHTML = `<div class="cargando"><span class="girando"></span>Interpretando ${consultas.length} consulta${consultas.length > 1 ? "s" : ""}…</div>`;
    await new Promise(r => setTimeout(r, 30)); // deja pintar el estado

    const progTexto = programaTexto; // conserva las líneas del editor para los mensajes de error
    const conCorte = Motor.tieneCorte(progTexto);
    const resultados = [];
    let predicados = [];
    for (const q of consultas) {
      const r = await Motor.ejecutar(progTexto, q.texto);
      r.offsetLinea = r.estado === "error_consulta" ? q.linea - 1 : 0;
      if (r.predicados) predicados = r.predicados;
      let traza = null, sinCorte = null;
      const cargo = r.estado !== "error_programa" && r.estado !== "error_consulta";
      if (cargo && !conCorte && !Motor.tieneCorte(q.texto)) traza = await Motor.trazar(progTexto, q.texto);
      if (cargo && conCorte) sinCorte = await Motor.ejecutar(Motor.quitarCortes(progTexto), Motor.quitarCortes(q.texto));
      resultados.push({ q, r, traza, sinCorte });
      if (r.estado === "error_programa") break; // el mismo error afectaría a todas
    }

    const temas = Explicador.temas(programa, consultas, predicados);
    const avisos = Explicador.advertencias(programa, consultas);
    if (incompleta) avisos.unshift(`La última línea (${cod(incompleta.texto.slice(0, 40))}) no termina en punto: toda cláusula y consulta debe terminar con ${cod(".")}`);

    salida.innerHTML = resultados.map((x, i) => tarjeta(x, i, programa, conCorte)).join("") + analisis(temas, avisos) + tarjetaIA();
    montarTarjetas();
    ultimo = { texto, resultados: resultados.map(x => ({
      consulta: x.q.texto,
      respuesta: Explicador.respuesta(x.r).texto,
      error: x.r.errorTexto || null,
      salida: x.r.salida || "",
      pasos: Explicador.narrar(x.traza, programa).map(p => p.html.replace(/<[^>]+>/g, "")).slice(0, 60),
      sinCorte: x.sinCorte ? Explicador.respuesta(x.sinCorte).texto : null,
    })) };
    boton.disabled = false;
    boton.innerHTML = `Enviar al agente <kbd>Ctrl</kbd><kbd>Enter</kbd>`;
    salida.querySelector(".tarjeta").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function aviso(titulo, html) {
    return `<article class="tarjeta tarjeta-aviso"><h3>${titulo}</h3><p>${html}</p></article>`;
  }

  /* ---------- Tarjeta de cada consulta ---------- */
  function tarjeta({ q, r, traza, sinCorte }, i, programa, conCorte) {
    const resp = Explicador.respuesta(r);
    const pasos = Explicador.narrar(traza, programa);
    const resumen = Explicador.resumen(r, traza, conCorte);
    const MAX = 30;
    const listaPasos = pasos.length ? `
      <ol class="pasos">${pasos.map((p, k) => `<li class="paso paso-${p.clase} ${k >= MAX ? "oculto" : ""}" style="--n:${Math.min(p.n, 8)}">${p.html}</li>`).join("")}</ol>
      ${pasos.length > MAX ? `<button class="btn-link" data-ver-pasos>Ver los ${pasos.length} pasos</button>` : ""}
      ${traza && traza.total > traza.eventos.length ? `<p class="nota">La búsqueda tuvo ${traza.total} pasos; se muestran los primeros ${traza.eventos.length}.</p>` : ""}` : "";

    let corte = "";
    if (sinCorte) {
      const a = resp.texto, b = Explicador.respuesta(sinCorte).texto;
      const igual = a === b;
      corte = `
        <div class="corte ${igual ? "verde" : "rojo"}">
          <h4>Alternativas de corte: ¿qué pasa sin el <code>!</code>?</h4>
          <div class="comparar">
            <div><small>Con corte</small><pre>${esc(a)}</pre></div>
            <div><small>Sin corte</small><pre>${esc(b)}</pre></div>
          </div>
          <p>${igual
            ? `En esta consulta quitar el corte <b>no cambia la respuesta</b>: aquí el corte solo evita explorar alternativas (actúa como corte verde). Revisa las advertencias de abajo: otras consultas sí pueden depender de él.`
            : `Sin el corte la respuesta <b>cambia</b>: es un <b>corte rojo</b>, forma parte de la lógica del programa. Al quitarlo aparecen las soluciones que el corte estaba podando.`}
            Alternativas sin corte: ${cod("( Condición -> Entonces ; SiNo )")}, la negación ${cod("\\+")} en la otra cláusula, u ${cod("once(Meta)")} para quedarse con la primera solución.</p>
          <p class="nota">Con corte no se muestra la traza paso a paso: el corte poda ramas y la traza simplificada podría confundir.</p>
        </div>`;
    }

    return `
      <article class="tarjeta" style="--retraso:${i * 70}ms">
        <div class="consulta"><span class="prompt">?-</span><code>${esc(q.texto)}.</code><span class="linea">línea ${q.linea}</span></div>
        <div class="respuesta respuesta-${resp.tipo}">
          <span class="etiqueta">Esta es la respuesta:</span>
          <pre>${esc(resp.texto)}</pre>
          ${(resp.notas || []).map(n => `<p class="nota">${esc(n)}</p>`).join("")}
        </div>
        ${resp.error ? `<div class="error"><b>${esc(resp.error.titulo)}</b><p>${resp.error.detalle}</p></div>` : ""}
        ${r.salida ? `<div class="consola"><small>Salida del programa (write / nl / format)</small><pre>${esc(r.salida)}</pre></div>` : ""}
        <div class="explicacion">
          <h4>Explicación</h4>
          <p class="resumen">${esc(resumen)}</p>
          ${listaPasos}
        </div>
        ${corte}
      </article>`;
  }

  function analisis(temas, avisos) {
    return `
      <article class="tarjeta tarjeta-analisis">
        <h3>Lo que el agente reconoce en tu programa</h3>
        ${avisos.length ? `<ul class="avisos">${avisos.map(a => `<li>${a}</li>`).join("")}</ul>` : ""}
        <div class="temas">${temas.map(t => `<details class="tema" open><summary>${esc(t.titulo)}</summary><p>${t.detalle}</p></details>`).join("") || '<p class="nota">Solo consultas a predicados predefinidos.</p>'}</div>
        <p class="nota">Cada consulta se ejecuta por separado sobre el mismo programa, como si se cargara de nuevo.</p>
      </article>`;
  }

  function tarjetaIA() {
    if (!iaDisponible) return "";
    return `
      <article class="tarjeta tarjeta-ia">
        <h3>Explicación del agente de IA</h3>
        <p class="nota">Claude recibe tu programa y las respuestas reales del intérprete, y explica el razonamiento con sus palabras.</p>
        <button class="btn btn-sec" id="btnIA">Pedir explicación a la IA</button>
        <div id="respuestaIA"></div>
      </article>`;
  }

  function montarTarjetas() {
    $$("[data-ver-pasos]").forEach(b => b.addEventListener("click", () => {
      b.closest(".explicacion").querySelectorAll(".oculto").forEach(li => li.classList.remove("oculto"));
      b.remove();
    }));
    const b = $("#btnIA");
    if (b) b.addEventListener("click", pedirIA);
  }

  /* ---------- Agente de IA (opcional, función serverless) ---------- */
  async function pedirIA() {
    const b = $("#btnIA"), caja = $("#respuestaIA");
    b.disabled = true;
    b.innerHTML = `<span class="girando"></span>Pensando…`;
    try {
      const r = await fetch("/api/explicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ultimo) });
      const d = await r.json();
      caja.innerHTML = d.explicacion ? `<div class="ia-texto">${formatear(d.explicacion)}</div>` : `<p class="error">${esc(d.error || "No se pudo obtener la explicación.")}</p>`;
    } catch (e) {
      caja.innerHTML = `<p class="error">No se pudo conectar con el agente de IA.</p>`;
    }
    b.disabled = false;
    b.textContent = "Volver a pedir explicación";
  }

  // Formato mínimo: párrafos, listas, **negrita** y `código`
  function formatear(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .split(/\n{2,}/).map(bloque => /^\s*([-*]|\d+\.)\s/.test(bloque)
        ? `<ul>${bloque.split("\n").map(l => `<li>${l.replace(/^\s*([-*]|\d+\.)\s/, "")}</li>`).join("")}</ul>`
        : `<p>${bloque.replace(/\n/g, "<br>")}</p>`).join("");
  }

  async function revisarIA() {
    try {
      const r = await fetch("/api/explicar");
      if (r.ok) iaDisponible = !!(await r.json()).disponible;
    } catch (e) { iaDisponible = false; }
    $("#estadoIA").innerHTML = iaDisponible
      ? `<span class="punto ok"></span>Agente de IA (Claude) conectado`
      : `<span class="punto"></span>Intérprete local · IA no configurada`;
  }

  /* ---------- Tema claro / oscuro ---------- */
  $("#btnTema").addEventListener("click", () => {
    const r = document.documentElement;
    const oscuro = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    r.dataset.theme = oscuro ? "light" : "dark";
    try { localStorage.setItem("tema", r.dataset.theme); } catch (e) { /* */ }
  });
  try { const t = localStorage.getItem("tema"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* */ }

  $("#btnEnviar").addEventListener("click", enviar);
  $("#btnLimpiar").addEventListener("click", () => { editor.value = ""; pintarNumeros(); editor.focus(); $("#resultado").innerHTML = ""; });

  editor.value = EJEMPLOS[0].codigo;
  pintarNumeros();
  pintarEjemplos();
  revisarIA();
})();
