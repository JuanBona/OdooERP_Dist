import { useCallback, useLayoutEffect, useState } from "react";

// La app no tiene "páginas": al abrir un pedido la pantalla de la lista se destruye y, al volver, arrancaba
// de cero (otra vez en la semana de hoy, con los camiones cerrados y arriba de todo). Esta memoria hace que
// una pantalla se acuerde de dónde estaba mientras dura la sesión: semana, renglones abiertos, filtros y scroll.
const guardado = {};
const scrolls = {};

// Igual que useState, pero el valor se recuerda al salir de la pantalla y volver.
export function useVista(clave, inicial) {
  const [v, setV] = useState(() => (clave in guardado ? guardado[clave] : typeof inicial === "function" ? inicial() : inicial));
  const set = useCallback(x => setV(prev => {
    const nuevo = typeof x === "function" ? x(prev) : x;
    guardado[clave] = nuevo;
    return nuevo;
  }), [clave]);
  return [v, set];
}

// Se llama al salir de una pantalla (antes de que el navegador salte arriba) para recordar cuánto se había bajado.
export const guardarScroll = (pantalla, y) => { scrolls[pantalla] = y; };

// Al volver a una pantalla (desde un pedido o una ficha) deja el scroll donde estaba.
export function useRestaurarScroll(pantalla, volver) {
  useLayoutEffect(() => {
    if (volver && scrolls[pantalla] > 0) window.scrollTo(0, scrolls[pantalla]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// Al cambiar de usuario no se arrastra lo que había visto el anterior.
export function olvidarVistas() {
  Object.keys(guardado).forEach(k => delete guardado[k]);
  Object.keys(scrolls).forEach(k => delete scrolls[k]);
}
