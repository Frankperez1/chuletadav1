// Configuración de la Chuletada.
window.CHU_CONFIG = {
  FIREBASE_URL: "https://chuletada-4ff4b-default-rtdb.firebaseio.com",
  RAIZ: "chuletada",   // nodo dentro de la base (usa otro nombre por cada evento para no mezclar datos)
  CADA_SEG: 10,        // cada cuántos segundos sincroniza (solo si la pantalla está visible)
  API_KEY: "PEGA_AQUI_TU_WEB_API_KEY",   // Firebase > Configuración del proyecto > Clave de API web (empieza con AIza)
  ADMIN_EMAIL: "ADMIN@gmail.com",        // correo del administrador (creado en Firebase > Authentication)
  CAJERO_EMAIL: "CAJERO@gmail.com"       // correo del cajero (otro usuario, con su propia contraseña)
};
