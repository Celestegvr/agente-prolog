// Función serverless de Vercel: explicación de un programa Prolog con Claude.
// Se activa al definir la variable de entorno ANTHROPIC_API_KEY en el proyecto de Vercel.
// La respuesta exacta la calcula el intérprete en el navegador; la IA solo la explica.
import Anthropic from "@anthropic-ai/sdk";

const SISTEMA = `Eres un tutor de programación lógica para estudiantes de Ingeniería en Computación (curso de IA, Unidad III: Prolog).
Recibes un programa Prolog con consultas y, para cada consulta, la respuesta REAL que dio un intérprete de Prolog (Tau Prolog), la salida de write/nl y, si existe, una traza de resolución.
Tu tarea: explicar en español, con claridad y brevedad, POR QUÉ el programa da esa respuesta.
Reglas:
- La respuesta del intérprete es la verdad: no la cambies ni la contradigas. Si te parece rara, explica por qué ocurre (por ejemplo, un corte rojo o una diferencia con SWI-Prolog).
- Para cada consulta empieza con una línea "Esta es la respuesta: ..." copiando la respuesta del intérprete y luego "Explicación:" en 2 a 6 oraciones o viñetas: qué cláusulas unifican, cuándo hay retroceso, cómo se evalúa la aritmética, el papel de las listas, la negación como fallo, la disyunción o el corte, según aplique.
- Si hay un error, explica la causa y cómo corregirlo con un ejemplo corto.
- Si el programa usa corte (!), di si es verde o rojo comparando con la respuesta "sin corte" que se te da, y propone una alternativa sin corte.
- Usa \`código\` para términos de Prolog. No uses encabezados markdown.`;

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

export default async function handler(req, res) {
  const disponible = !!process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") return res.status(200).json({ disponible });
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!disponible) return res.status(503).json({ error: "El agente de IA no está configurado (falta ANTHROPIC_API_KEY)." });

  const datos = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const texto = String(datos.texto || "").slice(0, 12000);
  const resultados = Array.isArray(datos.resultados) ? datos.resultados.slice(0, 10) : [];
  if (!texto.trim() || !resultados.length) return res.status(400).json({ error: "Envía primero el código al agente." });

  const detalle = resultados.map((r, i) => [
    `Consulta ${i + 1}: ?- ${String(r.consulta).slice(0, 500)}.`,
    `Respuesta del intérprete: ${String(r.respuesta).slice(0, 1500)}`,
    r.error ? `Error técnico: ${String(r.error).slice(0, 500)}` : "",
    r.salida ? `Salida (write/nl): ${String(r.salida).slice(0, 800)}` : "",
    r.sinCorte ? `Respuesta si se quitan los cortes: ${String(r.sinCorte).slice(0, 800)}` : "",
    Array.isArray(r.pasos) && r.pasos.length ? `Traza de resolución:\n${r.pasos.slice(0, 40).map((p, k) => `${k + 1}. ${String(p).slice(0, 300)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");

  try {
    const respuesta = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      // si la petición fuera rechazada por un filtro de seguridad, se reintenta con otro modelo
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA,
      messages: [{ role: "user", content: `Programa Prolog:\n\`\`\`prolog\n${texto}\n\`\`\`\n\n${detalle}` }],
    });
    if (respuesta.stop_reason === "refusal") return res.status(200).json({ error: "La IA no pudo explicar este programa." });
    const explicacion = respuesta.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return res.status(200).json({ explicacion });
  } catch (e) {
    const estado = e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500;
    return res.status(estado).json({ error: estado === 429 ? "La IA está ocupada, intenta de nuevo en un momento." : "No se pudo obtener la explicación de la IA." });
  }
}
