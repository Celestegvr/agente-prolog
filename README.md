# Agente Prolog

Aplicación web con un agente de IA intérprete de código Prolog (Tarea Unidad III: Programación Lógica).

Pega los hechos, las reglas y las consultas `?-`; el agente ejecuta el programa con un intérprete real (Tau Prolog, en el navegador) y muestra **"Esta es la respuesta"** con una explicación paso a paso: unificación, retroceso, aritmética, listas, negación como fallo, disyunciones y corte (comparando con y sin `!`).

- `index.html`, `css/`, `js/`: la página (sitio estático).
- `js/tau/`: Tau Prolog (BSD-3).
- `api/explicar.js`: función de Vercel opcional que pide a Claude una explicación en lenguaje natural. Se activa al definir `ANTHROPIC_API_KEY` en el proyecto de Vercel.

Autora: María Celeste Guevara
