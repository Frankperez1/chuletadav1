# Chuletada – control de tarjetas y caja (web)

Página estática para GitHub Pages. Todos los archivos están en la raíz del repositorio.
Guarda en el celular y sincroniza con Firebase Realtime Database cuando hay internet;
sin internet queda en cola y se envía sola al volver la conexión.

## Archivos
- `index.html` la página · `app.js` dibuja la pantalla · `api-local.js` lógica en el navegador
- `sync.js` sincronización con Firebase · `clave.js` acceso del administrador · `config.js` datos de Firebase · `styles.css` diseño
- `sw.js` guarda la página para abrirla sin internet (si cambias archivos, sube el número `V`)
- `firebase-rules.json` reglas para pegar en Firebase

## Cómo funciona la seguridad
- **Vendedor:** anota a quién entregó cada tarjeta y si pagó. Al pulsar **Guardar y cerrar mis tarjetas** todo su rango queda cerrado.
- **Tarjeta cerrada:** solo la cambian el administrador y, únicamente el pago, el cajero (Firebase rechaza cualquier otro cambio, no solo la pantalla).
- **Cajero:** busca tarjetas, marca/anula pagos (también en tarjetas cerradas), ve vendedores y exporta. No cambia nombres, candados, precio ni vendedores.
- **Administrador:** todo lo del cajero, más cerrar/reabrir tarjetas, cambiar o añadir vendedores, precio, importar respaldos y borrar todo.
- Cada uno entra con su propia contraseña (cuentas de Firebase Authentication).
- Límite: una tarjeta **abierta** puede editarla cualquiera que sepa usar la consola. El candado protege después de guardar.

## Configuración (una sola vez)
1. Firebase > Authentication > Sign-in method: activar **Correo/contraseña**.
2. Authentication > Users > **Add user** dos veces: uno para el administrador y otro para el cajero (correos distintos, cada uno con su contraseña).
3. Configuración del proyecto > copiar la **Clave de API web** (empieza con `AIza`).
4. En `config.js` pegar `API_KEY`, `ADMIN_EMAIL` y `CAJERO_EMAIL`.
5. Realtime Database > Reglas: pegar `firebase-rules.json` (cambiando `ADMIN@gmail.com` y `CAJERO@gmail.com` por los mismos correos) y publicar.
