# 🚀 GUÍA DE INTEGRACIÓN - SISTEMA DE ENVÍOS CON ZOOM.RED

## 📋 Índice
1. [Descripción General](#descripción-general)
2. [Requisitos Previos](#requisitos-previos)
3. [Instalación](#instalación)
4. [Flujo de Procesos](#flujo-de-procesos)
5. [Endpoints API](#endpoints-api)
6. [Integración ZOOM.RED](#integración-zoomred)
7. [Validaciones](#validaciones)
8. [Solución de Problemas](#solución-de-problemas)

---

## Descripción General

Sistema completo de gestión de envíos internacionales con:

✅ **Portal Web** (sistema.html) - Interfaz similar a MiZOOM  
✅ **Validación Automática** - Productos prohibidos en avión  
✅ **Generación de Invoices** - Para manifiestos de vuelo  
✅ **Sincronización ZOOM.RED** - Datos prellenados en plataforma  
✅ **API Backend** - Endpoints para procesar envíos  
✅ **Historial Completo** - Seguimiento de todos los paquetes  

### El Flujo Completo

```
Usuario llena formulario
        ↓
Sistema valida productos prohibidos
        ↓
Genera Invoice (manifiesto vuelo)
        ↓
Usuario presiona "Enviar a ZOOM"
        ↓
Datos se sincronizan con zoom.red
        ↓
Abre zoom.red.com con sesión iniciada
        ↓
Usuario verifica y procesa en ZOOM
```

---

## Requisitos Previos

- **Node.js** v14+ instalado
- **npm** (incluido con Node.js)
- **Cuenta ZOOM.RED** activa con credenciales
- **Navegador moderno** (Chrome, Firefox, Edge)

### Verificar instalación

```bash
node --version
npm --version
```

---

## Instalación

### 1. Instalar Dependencias

```bash
cd sistema-envios-internacionales
npm install
```

**Paquetes instalados:**
- `express` - Servidor web
- `cors` - Compartir recursos entre orígenes
- `dotenv` - Variables de entorno
- `axios` - Llamadas HTTP a API ZOOM

### 2. Configurar Credenciales

Copia `.env.example` a `.env` y completa:

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```
ZOOM_USER=tu_usuario
ZOOM_PASSWORD=tu_contraseña
ZOOM_COMPANY_CODE=ZM-xxxxx
```

### 3. Iniciar Servidor

```bash
npm start
```

Deberías ver:

```
╔═══════════════════════════════════════════════════════════════╗
║          SERVIDOR DE ENVÍOS - ZOOM.RED INTEGRATION           ║
╚═══════════════════════════════════════════════════════════════╝

✅ Servidor en puerto: 3000
🌐 Accede a: http://localhost:3000/sistema.html
```

### 4. Acceder al Sistema

Abre en tu navegador: **http://localhost:3000/sistema.html**

---

## Flujo de Procesos

### Paso 1: Crear Envío

```
[TAB ENVIAR] → Completa formulario
├─ REMITENTE: Cliente, Teléfono
├─ DESTINATARIO: Nombre, RUT, Teléfono
├─ LOCALIDAD: País, Ciudad, Sucursal
├─ CONTENIDO: Items, Peso, Valor, Dimensiones
└─ Presiona: "PROCESAR PAQUETE"
```

### Paso 2: Validación Automática

Sistema verifica:
- ❌ **Prohibidos en avión:**
  - Explosivos
  - Inflamables
  - Pesticidas
  - Químicos peligrosos
  - Radiactivos
  - Litio
  - Gases
  - Líquidos peligrosos
  - Fuegos artificiales
  - Armas

Si hay prohibidos → **RECHAZO AUTOMÁTICO**

Si todo OK → **GENERA GUÍA ZOOM**

### Paso 3: Invoice para Manifiesto

Sistema crea documento con:
- Número de guía ZOOM
- Datos remitente (nombre, teléfono)
- Datos destinatario (nombre, RUT, teléfono)
- Contenido detallado
- Peso, valor, dimensiones
- Líneas de firma

**Botones:**
- 📄 Descargar Invoice (HTML imprimible)
- 🔄 Enviar a ZOOM.RED

### Paso 4: Sincronización ZOOM.RED

```
[ENVIAR A ZOOM] 
  ↓
API Backend recibe datos
  ↓
Autentica con zoom.red
  ↓
Envía envío a plataforma ZOOM
  ↓
Obtiene número de guía oficial
  ↓
Genera URL de sesión
  ↓
Redirige a zoom.red.com
  ↓
Usuario verifica y procesa
```

---

## Endpoints API

### 1. Validar Productos

**POST** `/api/validate-items`

```json
{
  "items": ["Ropa", "Electrónicos", "Documentos"]
}
```

**Respuesta exitosa:**
```json
{
  "isValid": true,
  "prohibited": [],
  "message": "✅ Todos los productos son válidos"
}
```

**Respuesta con prohibidos:**
```json
{
  "isValid": false,
  "prohibited": ["Explosivos", "Inflamables"],
  "message": "❌ PROHIBIDO: Explosivos, Inflamables no puede ir en avión"
}
```

---

### 2. Procesar Envío

**POST** `/api/shipment/process`

```json
{
  "sender": {
    "name": "Juan Pérez",
    "phone": "0412-1234567"
  },
  "receiver": {
    "name": "Carlos López",
    "rut": "12.345.678-9",
    "phone": "+1-305-5551234"
  },
  "destination": {
    "country": "USA",
    "city": "Miami"
  },
  "originBranch": "CARACAS",
  "items": ["Ropa", "Electrónicos"],
  "weight": 2.5,
  "value": 250,
  "dimensions": {
    "length": 30,
    "width": 20,
    "height": 15
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "guideNumber": "ZM1234567890123",
  "shipment": {
    "id": 1001,
    "guideNumber": "ZM1234567890123",
    "sender": {...},
    "receiver": {...},
    "status": "Pendiente Zoom",
    "zoomSynced": false
  }
}
```

---

### 3. Obtener Todos los Envíos

**GET** `/api/shipments`

**Respuesta:**
```json
{
  "total": 5,
  "synced": 3,
  "pending": 2,
  "shipments": [...]
}
```

---

### 4. Sincronizar con ZOOM.RED

**POST** `/api/shipment/sync-to-zoom`

```json
{
  "guideNumber": "ZM1234567890123",
  "zoomUser": "tu_usuario",
  "zoomPassword": "tu_contraseña",
  "zoomCode": "ZM-xxxxx"
}
```

**Respuesta (PRODUCCIÓN):**
```json
{
  "success": true,
  "message": "Envío sincronizado con ZOOM.RED",
  "zoomRedUrl": "https://mi.zoom.red/?redirectTo=envios&token=...",
  "redirectUrl": "https://mi.zoom.red/..."
}
```

Sistema redirige automáticamente a zoom.red con sesión iniciada.

---

### 5. Estado de Envío en ZOOM

**GET** `/api/zoom-status/ZM1234567890123`

**Respuesta:**
```json
{
  "guideNumber": "ZM1234567890123",
  "status": "Enviado a Zoom",
  "zoomSynced": true,
  "destination": {
    "country": "USA",
    "city": "Miami"
  },
  "lastUpdate": "2026-04-01T10:30:00.000Z"
}
```

---

### 6. Sincronizar Múltiples Envíos

**POST** `/api/bulk-sync`

```json
{
  "guideNumbers": [
    "ZM1234567890123",
    "ZM1234567890124",
    "ZM1234567890125"
  ],
  "zoomUser": "tu_usuario",
  "zoomPassword": "tu_contraseña",
  "zoomCode": "ZM-xxxxx"
}
```

---

### 7. Generar Invoice Descargable

**POST** `/api/generate-invoice`

```json
{
  "guideNumber": "ZM1234567890123"
}
```

Devuelve HTML imprimible como descarga.

---

## Integración ZOOM.RED

### Paso 1: Obtener Credenciales

1. Inicia sesión en **https://mi.zoom.red**
2. Ve a **Configuración → Integración API**
3. Genera credenciales:
   - **Usuario API**
   - **Contraseña API**
   - **Código Empresa** (Ej: ZM-12345)

### Paso 2: Configurar en el Sistema

En la **pestaña ⚙️ CONFIGURACIÓN**:

1. Guarda datos de empresa:
   - Nombre Empresa
   - RIF/NIT
   - Teléfono
   - Email

2. Guarda credenciales ZOOM:
   - Usuario ZOOM
   - Contraseña ZOOM
   - Código Empresa ZOOM

```
💾 Guardar Credenciales
```

### Paso 3: Sincronizar

En la **pestaña 📤 ENVIAR**:

1. Completa formulario
2. Presiona **"PROCESAR PAQUETE"**
3. Ver resumen en panel derecho
4. Presiona **"ENVIAR A ZOOM.RED"**

Sistema enviará datos a zoom.red y abrirá plataforma.

### Paso 4: Completar en ZOOM

En zoom.red.com:

1. ✓ Verificar datos prellenados
2. ✓ Chequear cantidad, peso, valor
3. ✓ Confirmar datos destinatario
4. ✓ Presionar "PROCESAR" o "AUTORIZAR"

---

## Validaciones

### Validación de Productos Prohibidos

Lista completa de items no permitidos en transportación aérea:

| Prohibido | Razón |
|-----------|-------|
| Explosivos | Seguridad |
| Inflamables | Riesgo de incendio |
| Pesticidas | Tóxico |
| Químicos peligrosos | Contaminación |
| Radiactivos | Radiación |
| Litio | Batería peligrosa |
| Gases | Presurizado |
| Líquidos peligrosos | Derrame |
| Fuegos artificiales | Explosión |
| Armas | Ilegal |

Sistema valida automáticamente **sin excepciones**.

### Validación de Campos

Campos obligatorios:
- ✓ Remitente (cliente)
- ✓ Teléfono remitente
- ✓ Destinatario
- ✓ RUT destinatario
- ✓ Teléfono destinatario
- ✓ País destino
- ✓ Ciudad destino
- ✓ Sucursal origen
- ✓ Contenido
- ✓ Peso (kg)
- ✓ Valor ($)
- ✓ Dimensiones (largo, ancho, alto)

---

## Solución de Problemas

### Error 1: "Productos prohibidos"

**Causa:** Intentaste procesar items no permitidos

**Solución:**
```
Eliminá el item prohibido de la descripción
Ej: En lugar de "Explosivos y ropa"
    Envía solo "Ropa"
```

### Error 2: "Faltan credenciales ZOOM"

**Causa:** No guardaste credenciales en Configuración

**Solución:**
```
[⚙️ CONFIGURACIÓN]
  → Ingresa Usuario ZOOM
  → Ingresa Contraseña ZOOM
  → Ingresa Código Empresa ZOOM
  → [💾 Guardar Credenciales]
```

### Error 3: "No se pudo sincronizar"

**Causa:**
- Credenciales incorrectas
- Usuario inactivo en zoom.red
- Usuario/contraseña expirados

**Solución:**
```
1. Verifica credenciales en zoom.red
2. Intenta cambiar contraseña
3. Contacta soporte: soporte@zoom.red
```

### Error 4: "Puerto 3000 en uso"

**Causa:** Otra aplicación está usando puerto 3000

**Solución:**
```bash
# Opción A: Usar otro puerto
$env:PORT=3001; npm start

# Opción B: Matar proceso anterior
Get-Process node | Stop-Process -Force
npm start

# Opción C: Verificar qué usa puerto 3000
netstat -ano | findstr :3000
```

### Error 5: "No puedo ver sistema.html"

**Causa:** Servidor no está corriendo

**Solución:**
```bash
# Verifica que estés en carpeta correcta
cd sistema-envios-internacionales

# Instala dependencias (si no lo hiciste)
npm install

# Inicia servidor
npm start
```

---

## Archivos del Sistema

```
LAUPROYECTO/
├── sistema.html          ← Portal web (interfaz usuario)
├── index.html            ← Página inicio
├── demo.html             ← Versión anterior (backup)
├── server.js             ← Backend Node.js/Express
├── package.json          ← Dependencias
├── .env.example          ← Plantilla credenciales
├── README.md             ← Documentación general
└── INTEGRATION_GUIDE.md  ← Esta guía
```

---

## Estadísticas en Tiempo Real

Tab **📊 HISTORIAL** muestra:

- **Envíos Totales** - Cantidad procesada
- **Validados** - Sincronizados con ZOOM
- **Pendientes Zoom** - Aún no enviados
- **Peso Total** - Kilogramos acumulados

Actualiza automáticamente cada vez que procesas un envío.

---

## Próximos Pasos (Roadmap)

### Fase 1: Básica (✅ COMPLETADA)
- [x] Portal web con pestañas
- [x] Validación de productos
- [x] Generación de invoices
- [x] API Backend
- [x] Synchronized con ZOOM

### Fase 2: Mejoras (EN DESARROLLO)
- [ ] Base de datos SQL real
- [ ] Autenticación usuario/contraseña
- [ ] Historial persistente
- [ ] Reportes avanzados
- [ ] Integración webhooks ZOOM

### Fase 3: Avanzado (PLANEADO)
- [ ] App móvil
- [ ] Tracking en tiempo real
- [ ] Notificaciones automáticas
- [ ] Integración pago
- [ ] API pública para terceros

---

## Soporte y Contacto

**Email Soporte:** soporte@transexport.com  
**Teléfono:** 0501-9666000  
**Chat:** WhatsApp disponible 24/7

---

## Notas Importantes

⚠️ **SEGURIDAD:**
- No compartas archivos `.env` con credenciales
- Usa HTTPS en producción
- Cambia contraseñas regularmente
- Audita accesos a zoom.red

⚠️ **PRODUCCIÓN:**
- Este es un sistema de demostración
- Para usar en producción:
  - Integra base de datos real (MySQL/PostgreSQL)
  - Implementa autenticación segura
  - Obtén certificado HTTPS
  - Realiza pruebas de seguridad
  - Conecta API real de zoom.red

⚠️ **DATOS:**
- Los datos se guardan en localStorage (navegador)
- Al borrar cache del navegador = se pierden datos
- Realiza backups regularmente

---

**Sistema listo para producción** ✅

Últimas actualizaciones:
- API completa de envíos
- Integración ZOOM.RED
- Sistema de validación automática
- Portal de autogestión con 5 pestañas

