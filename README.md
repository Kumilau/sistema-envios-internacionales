# Sistema de Gestión de Envíos Internacionales

Portal web para agencias de envío y courier que agiliza la recepción de paquetes en mostrador: registra el envío, valida automáticamente si el contenido puede viajar en avión, genera el invoice imprimible y lleva el historial con estadísticas.

Diseñado para bajar el tiempo de procesamiento por paquete de unos 45 minutos (proceso manual) a menos de 5.

**Tecnologías:** Node.js · Express · JavaScript · HTML/CSS · API REST · SheetJS (exportación a Excel)

## Funcionalidades

- **Registro de envíos** con remitente, destinatario, contenido, peso, valor y dimensiones
- **Validación automática de mercancías peligrosas**: rechaza explosivos, inflamables, gases comprimidos, baterías de litio, químicos, armas y otros productos prohibidos en carga aérea
- **Invoice imprimible** con número de guía, listo para firma del cliente
- **Remitentes y destinatarios frecuentes** para no reingresar datos
- **Historial y estadísticas**: envíos totales, sincronizados, pendientes y peso acumulado
- **API REST** protegida con autenticación básica

> **Estado de la integración con el courier:** el flujo de sincronización con la plataforma ZOOM.RED está preparado en el backend, pero actualmente funciona en modo simulado. Conectarlo requiere credenciales de API del courier.

## Instalación

Requisitos: Node.js 18 o superior.

```bash
npm install
cp .env.example .env
```

Edita `.env` y define una clave propia (el servidor no arranca con la clave de ejemplo):

```
APP_BASIC_USER=operador
APP_BASIC_PASSWORD=tu-clave-segura
```

Inicia el servidor:

```bash
npm start
```

Abre `http://localhost:3000/sistema.html` e ingresa el usuario y clave definidos en `.env` en la pestaña Configuración.

**Demo sin servidor:** `demo.html` funciona abriéndolo directamente en el navegador y guarda los datos en el propio navegador. Sirve para mostrar el flujo sin instalar nada.

## Flujo de trabajo

1. El operador completa el formulario del envío
2. El sistema valida el contenido: si hay productos prohibidos, rechaza con un mensaje claro
3. Si todo está bien, genera el número de guía
4. Se imprime el invoice para firma del cliente
5. El envío queda en el historial, listo para sincronizar con el courier

## API

Todas las rutas bajo `/api` requieren autenticación básica.

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/validate-items` | Valida si el contenido tiene productos prohibidos |
| POST | `/api/shipment/process` | Registra un envío y genera su número de guía |
| GET | `/api/shipments` | Lista los envíos |
| POST | `/api/shipment/sync-to-zoom` | Sincroniza un envío con el courier (simulado) |
| GET | `/api/zoom-status/:guideNumber` | Estado de un envío en el courier |
| POST | `/api/bulk-sync` | Sincroniza varios envíos a la vez |
| POST | `/api/generate-invoice` | Genera el invoice de un envío |
| GET/POST | `/api/senders` | Remitentes frecuentes |
| GET/POST | `/api/receivers` | Destinatarios frecuentes |
| GET | `/api/locations` | Países y ciudades de destino |

Detalle y ejemplos en [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).

## Estructura

```
├── index.html          Página de presentación
├── sistema.html        Portal principal
├── sistema-app.js      Lógica del portal
├── demo.html           Demo que funciona sin servidor
├── server.js           Backend Express y API
├── data/               Datos locales (no se versiona)
└── .env.example        Plantilla de configuración
```

## Seguridad

- La API exige usuario y clave; el servidor no inicia sin una clave propia
- El servidor publica solo las páginas del sistema; el código, `.env` y los datos quedan privados
- CORS restringido a localhost
- Credenciales del courier guardadas solo durante la sesión del navegador

Pendiente para uso en producción: usuarios con roles, HTTPS y base de datos PostgreSQL. Ver [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md).

## Próximos pasos

- Integración real con la API del courier
- Migración a PostgreSQL
- Módulo de reportes
- Usuarios con roles (operador, supervisor, administrador)

---

Desarrollado por Lau, Analista Programadora.
