'use client';

import Cookies from 'js-cookie';

/** Guarda el JWT en cookie (cliente) */
export function setToken(token: string) {
  // opcional: añade opciones si quieres caducidad, etc.
  Cookies.set('token', token, { sameSite: 'lax' });
}

/** Lee el JWT en cliente */
export function getToken(): string | undefined {
  return Cookies.get('token');
}

/** Borra el JWT (logout en cliente) */
export function clearToken() {
  Cookies.remove('token');
}
