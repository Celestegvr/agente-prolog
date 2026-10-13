/* =========================================================
   Ejemplos listos para probar, uno por cada tema de la tarea
   (basados en las diapositivas de la Unidad III).
   ========================================================= */
const EJEMPLOS = [
  {
    id: "clausulas", tema: "Interpretación de cláusulas", titulo: "miembro/2 (ejemplo de la tarea)",
    codigo: `miembro(X, [X|_]).
miembro(X, [_|T]) :- miembro(X, T).

?- miembro(b, [a,b,c]).`,
  },
  {
    id: "hechos", tema: "Hechos y reglas", titulo: "Familia",
    codigo: `% Hechos
padre(juan, maria).
padre(juan, pedro).
padre(pedro, ana).

% Reglas
abuelo(X, Z) :- padre(X, Y), padre(Y, Z).
hermano(X, Y) :- padre(P, X), padre(P, Y), X \\== Y.

?- abuelo(juan, Quien).
?- hermano(maria, H).`,
  },
  {
    id: "tipos", tema: "Predicados y tipos de datos", titulo: "Átomos, números y estructuras",
    codigo: `alumno(ana, nota(80, 90, 100)).
libro(titulo('IA'), autor(russell), anio(2021)).

?- atom(ana), number(7), integer(5), float(3.14).
?- compound(f(a)), is_list([1,2]), var(X).
?- alumno(ana, nota(A, B, C)).
?- atom(5).`,
  },
  {
    id: "variables", tema: "Variables", titulo: "Anónima, libre y ligada",
    codigo: `padre(juan, maria).
tiene_hijos(P) :- padre(P, _).

?- tiene_hijos(juan).
?- padre(juan, _).
?- X = 5, Y is X + 1.
?- Y is X + 1.`,
  },
  {
    id: "aritmetica", tema: "Operadores aritméticos", titulo: "is, =:= y =",
    codigo: `promedio(A, B, C, P) :- P is (A + B + C) / 3.
celsius_fahrenheit(C, F) :- F is C * 9 / 5 + 32.

?- X is 3 + 4 * 2.
?- promedio(80, 90, 100, P).
?- celsius_fahrenheit(25, F).
?- X = 2 + 3.
?- 2 =:= 2.0, 7 // 2 =:= 3, 7 mod 2 =:= 1.`,
  },
  {
    id: "neurona", tema: "Operadores aritméticos", titulo: "Neurona artificial y distancia",
    codigo: `salida(X1, X2, S) :-
    W1 = 0.5, W2 = 0.3, B = -0.2,
    Z is X1*W1 + X2*W2 + B,
    activar(Z, S).
activar(Z, 1) :- Z > 0.
activar(Z, 0) :- Z =< 0.

dist(punto(X1,Y1), punto(X2,Y2), D) :-
    DX is X2 - X1, DY is Y2 - Y1,
    D is sqrt(DX*DX + DY*DY).

?- salida(1, 1, S).
?- salida(0, 0, S).
?- dist(punto(0,0), punto(3,4), D).`,
  },
  {
    id: "listas", tema: "Listas", titulo: "Longitud, suma y último",
    codigo: `longitud([], 0).
longitud([_|T], N) :- longitud(T, N1), N is N1 + 1.

suma([], 0).
suma([X|T], S) :- suma(T, S1), S is S1 + X.

ultimo([X], X).
ultimo([_|T], X) :- ultimo(T, X).

?- longitud([a,b,c], N).
?- suma([4,5,6], S).
?- ultimo([1,2,3], U).
?- append(X, Y, [1,2]).`,
  },
  {
    id: "negacion", tema: "Negación como fallo", titulo: "¿Puede volar?",
    codigo: `ave(tweety).
ave(pingu).
pinguino(pingu).

puede_volar(X) :- ave(X), \\+ pinguino(X).

?- puede_volar(tweety).
?- puede_volar(pingu).
?- \\+ ave(perro).`,
  },
  {
    id: "disyuncion", tema: "Disyunciones", titulo: "Vocales y estaciones",
    codigo: `vocal(X) :- X = a ; X = e ; X = i ; X = o ; X = u.
fin_de_semana(D) :- ( D = sabado ; D = domingo ).

?- vocal(e).
?- vocal(z).
?- fin_de_semana(domingo).
?- vocal(V).`,
  },
  {
    id: "corte", tema: "Corte", titulo: "Corte verde y rojo",
    codigo: `% Máximo con corte (corte rojo: la 2a consulta responde true
% aunque el máximo de 5 y 3 es 5, porque el corte no llega a ejecutarse)
max(X, Y, X) :- X >= Y, !.
max(_, Y, Y).

% Clasificar con corte (corte verde)
signo(X, positivo) :- X > 0, !.
signo(X, cero) :- X =:= 0, !.
signo(_, negativo).

?- max(7, 3, M).
?- max(5, 3, 3).
?- signo(-4, S).`,
  },
  {
    id: "alternativas", tema: "Alternativas de corte", titulo: "if-then-else, \\+ y once",
    codigo: `% Lo mismo que max/3 con corte, sin usar !
max2(X, Y, M) :- ( X >= Y -> M = X ; M = Y ).

% Con negación como fallo
max3(X, Y, X) :- X >= Y.
max3(X, Y, Y) :- \\+ X >= Y.

?- max2(7, 3, M).
?- max2(5, 3, 3).
?- max3(2, 9, M).
?- once(member(X, [a,b,c])).`,
  },
  {
    id: "dinamicos", tema: "Predicados y tipos de datos", titulo: "Memoria de un agente (assert)",
    codigo: `:- dynamic creencia/1.

aprender(H) :- assertz(creencia(H)).

?- aprender(llueve), aprender(hace_frio), creencia(X).
?- write('Hola IA'), nl.`,
  },
];
