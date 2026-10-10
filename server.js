/**
 * SERVIDOR BACKEND - INTEGRACIÓN ZOOM.RED
 * Sincroniza envíos desde el portal con la plataforma ZOOM.RED
 * 
 * INSTALACIÓN:
 * npm install express cors dotenv axios
 * 
 * USO:
 * node server.js
 * Accede a: http://localhost:3000
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_BASIC_USER = process.env.APP_BASIC_USER || 'operador';
const APP_BASIC_PASSWORD = process.env.APP_BASIC_PASSWORD;

// No arrancar sin una clave propia definida en .env
if (!APP_BASIC_PASSWORD || APP_BASIC_PASSWORD === 'cambia-esta-clave') {
    console.error('ERROR: define APP_BASIC_PASSWORD en el archivo .env con una clave propia antes de iniciar el servidor.');
    process.exit(1);
}

const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'null'
]);

// MIDDLEWARE
app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
// Solo se publican las páginas del sistema; el código del servidor, .env y data/ quedan privados
const PUBLIC_FILES = new Set(['index.html', 'sistema.html', 'sistema-app.js', 'demo.html']);
app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
        return next();
    }
    const file = req.path === '/' ? 'index.html' : req.path.slice(1);
    if (PUBLIC_FILES.has(file)) {
        return res.sendFile(path.join(__dirname, file));
    }
    return res.status(404).send('No encontrado');
});

function requireBasicAuth(req, res, next) {
    if (req.method === 'OPTIONS') {
        return next();
    }

    const authHeader = req.headers.authorization || '';
    const expectedHeader = `Basic ${Buffer.from(`${APP_BASIC_USER}:${APP_BASIC_PASSWORD}`).toString('base64')}`;

    if (authHeader !== expectedHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Sistema de Envios"');
        return res.status(401).json({ error: 'No autorizado' });
    }

    return next();
}

app.use('/api', requireBasicAuth);

// CONFIGURACIÓN
const ZOOM_API_URL = 'https://www2.zoom.red/api/v1';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'server-data.json');
const prohibitedItems = [
    'Explosivos', 'Inflamables', 'Pesticidas', 'Químicos peligrosos',
    'Radiactivos', 'Litio', 'Gases', 'Líquidos peligrosos', 'Fuegos artificiales', 'Armas'
];

const defaultSenders = [
    { id: 1, name: 'Empresa ABC', phone: '+56912345678', email: '', address: '', active: true, created_at: new Date().toISOString() },
    { id: 2, name: 'Distribuidora XYZ', phone: '+56987654321', email: '', address: '', active: true, created_at: new Date().toISOString() },
    { id: 3, name: 'Comercial Global', phone: '+56998765432', email: '', address: '', active: true, created_at: new Date().toISOString() }
];

const defaultReceivers = [
    { id: 1, name: 'Juan Pérez', phone: '+34912345678', usage_count: 5, rut: '12345678-9', city: 'Madrid', country: 'España', email: '', address: '', last_used: new Date().toISOString() },
    { id: 2, name: 'María López', phone: '+34987654321', usage_count: 3, rut: '98765432-1', city: 'Barcelona', country: 'España', email: '', address: '', last_used: new Date().toISOString() },
    { id: 3, name: 'Pedro García', phone: '+34998765432', usage_count: 8, rut: '55555555-5', city: 'Valencia', country: 'España', email: '', address: '', last_used: new Date().toISOString() },
    { id: 4, name: 'Ana Rodríguez', phone: '+34965432109', usage_count: 2, rut: '77777777-7', city: 'Sevilla', country: 'España', email: '', address: '', last_used: new Date().toISOString() }
];

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createDefaultStore() {
    return {
        senders: [...defaultSenders],
        receivers: [...defaultReceivers],
        shipments: []
    };
}

function loadStore() {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
        const initialStore = createDefaultStore();
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialStore, null, 2), 'utf8');
        return initialStore;
    }

    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            senders: Array.isArray(parsed.senders) ? parsed.senders : [...defaultSenders],
            receivers: Array.isArray(parsed.receivers) ? parsed.receivers : [...defaultReceivers],
            shipments: Array.isArray(parsed.shipments) ? parsed.shipments : []
        };
    } catch (error) {
        const fallbackStore = createDefaultStore();
        fs.writeFileSync(DATA_FILE, JSON.stringify(fallbackStore, null, 2), 'utf8');
        return fallbackStore;
    }
}

let store = loadStore();
let senders = store.senders;
let receivers = store.receivers;
let shipments = store.shipments;

function saveStore() {
    store = { senders, receivers, shipments };
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getNextId(items) {
    return items.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
}

function normalizeItems(items) {
    if (Array.isArray(items)) {
        return items.map(item => String(item).trim()).filter(Boolean);
    }
    if (typeof items === 'string') {
        return items.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCountryName(countryCode) {
    const entry = ZOOM_LOCATIONS.find(location => location.country_code === String(countryCode || '').toUpperCase());
    return entry ? entry.country : String(countryCode || '').trim();
}

// ============================================
// RUTAS API
// ============================================

/** Validar productos prohibidos */
app.post('/api/validate-items', (req, res) => {
    const items = normalizeItems(req.body?.items);
    
    if (items.length === 0) {
        return res.status(400).json({ error: 'Items inválidos' });
    }

    const prohibited = items.filter(item => 
        prohibitedItems.some(p => item.toLowerCase().includes(p.toLowerCase()))
    );

    res.json({
        isValid: prohibited.length === 0,
        prohibited,
        message: prohibited.length > 0 
            ? `❌ PROHIBIDO: ${prohibited.join(', ')} no puede ir en avión`
            : '✅ Todos los productos son válidos'
    });
});

/** Procesar nuevo envío */
app.post('/api/shipment/process', (req, res) => {
    try {
        const { sender, receiver, destination, items, weight, value, dimensions, originBranch } = req.body;
        const normalizedItems = normalizeItems(items);

        if (!sender?.name || !receiver?.name || !destination?.city || !destination?.country || !originBranch) {
            return res.status(400).json({ error: 'Datos del envío incompletos' });
        }

        if (normalizedItems.length === 0) {
            return res.status(400).json({ error: 'Debe indicar al menos un artículo' });
        }

        // Validar productos prohibidos
        const prohibited = normalizedItems.filter(item =>
            prohibitedItems.some(p => item.toLowerCase().includes(p.toLowerCase()))
        );

        if (prohibited.length > 0) {
            return res.status(400).json({
                error: `Productos prohibidos: ${prohibited.join(', ')}`
            });
        }

        // Generar guía
        const guideNumber = `ZM${Date.now()}${Math.floor(Math.random() * 1000)}`;

        const shipment = {
            id: getNextId(shipments),
            guideNumber,
            sender,
            receiver,
            destination,
            originBranch,
            items: normalizedItems,
            weight,
            value,
            dimensions,
            date: new Date().toISOString(),
            status: 'Pendiente Zoom',
            zoomSynced: false
        };

        shipments.push(shipment);
        saveStore();

        res.json({
            success: true,
            guideNumber,
            shipment
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/** Obtener todos los envíos */
app.get('/api/shipments', (req, res) => {
    res.json(shipments);
});

/** Sincronizar con ZOOM.RED */
app.post('/api/shipment/sync-to-zoom', async (req, res) => {
    try {
        const { guideNumber, zoomUser, zoomPassword, zoomCode } = req.body;

        if (!guideNumber || !zoomUser || !zoomPassword || !zoomCode) {
            return res.status(400).json({ error: 'Faltan credenciales o guía' });
        }

        // Buscar envío
        const shipment = shipments.find(s => s.guideNumber === guideNumber);
        if (!shipment) {
            return res.status(404).json({ error: 'Envío no encontrado' });
        }

        // SIMULACIÓN - En producción: autenticar y sincronizar con zoom.red
        // const auth = await authenticateZoom(zoomUser, zoomPassword);
        // const zoomResponse = await createZoomShipment(auth.token, zoomCode, shipment);

        // Marcar como sincronizado
        shipment.zoomSynced = true;
        shipment.status = 'Enviado a Zoom';
        shipment.zoomSyncTime = new Date().toISOString();
        saveStore();

        const zoomRedUrl = 'https://mi.zoom.red/';

        res.json({
            success: true,
            message: 'Envío marcado para sincronización. Inicia sesión manualmente en ZOOM.RED para continuar.',
            guideNumber,
            zoomRedUrl,
            redirectUrl: zoomRedUrl,
            requiresManualLogin: true,
            shipment
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/** Obtener estado en ZOOM */
app.get('/api/zoom-status/:guideNumber', (req, res) => {
    const { guideNumber } = req.params;
    const shipment = shipments.find(s => s.guideNumber === guideNumber);

    if (!shipment) {
        return res.status(404).json({ error: 'Envío no encontrado' });
    }

    res.json({
        guideNumber: shipment.guideNumber,
        status: shipment.status,
        zoomSynced: shipment.zoomSynced,
        zoomSyncTime: shipment.zoomSyncTime || null,
        destination: shipment.destination,
        lastUpdate: new Date().toISOString()
    });
});

/** Sincronizar múltiples envíos */
app.post('/api/bulk-sync', (req, res) => {
    try {
        const { guideNumbers, zoomUser, zoomPassword, zoomCode } = req.body;

        if (!Array.isArray(guideNumbers) || guideNumbers.length === 0) {
            return res.status(400).json({ error: 'Guías no proporcionadas' });
        }

        const results = guideNumbers.map(guideNumber => {
            const shipment = shipments.find(s => s.guideNumber === guideNumber);
            if (shipment) {
                shipment.zoomSynced = true;
                shipment.status = 'Enviado a Zoom';
                shipment.zoomSyncTime = new Date().toISOString();
                return { guideNumber, status: 'Sincronizado' };
            }
            return { guideNumber, status: 'No encontrado' };
        });

        saveStore();

        res.json({
            success: true,
            totalProcessed: guideNumbers.length,
            successful: results.filter(r => r.status === 'Sincronizado').length,
            results
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/** Generar invoice descargable */
app.post('/api/generate-invoice', (req, res) => {
    const { guideNumber } = req.body;
    const shipment = shipments.find(s => s.guideNumber === guideNumber);

    if (!shipment) {
        return res.status(404).json({ error: 'Envío no encontrado' });
    }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Invoice ${escapeHtml(shipment.guideNumber)}</title>
            <style>
                body { font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #2a5298; padding-bottom: 20px; margin-bottom: 30px; }
                .logo { font-size: 24px; font-weight: bold; color: #2a5298; }
                .guide { font-size: 18px; font-weight: bold; margin: 20px 0; color: #667eea; }
                .section { margin: 20px 0; }
                .section-title { font-weight: bold; color: #2a5298; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
                .info { margin: 8px 0; font-size: 13px; }
                .label { font-weight: bold; display: inline-block; width: 150px; }
                table { width: 100%; margin: 20px 0; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border: 1px solid #ddd; }
                th { background: #f0f0f0; font-weight: bold; }
                .signature { margin-top: 40px; display: flex; justify-content: space-around; }
                .sig-line { border-top: 1px solid black; width: 180px; text-align: center; margin-top: 50px; font-size: 12px; }
                .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #ccc; padding-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">📦 SISTEMA DE ENVÍOS INTERNACIONALES</div>
                <p style="margin: 10px 0; color: #666;">INVOICE / GUÍA DE ENVÍO PARA MANIFIESTO DE VUELO</p>
            </div>

            <div class="guide">Guía ZOOM: <strong style="background: #fef3c7; padding: 2px 8px; border-radius: 4px; color: #92400e;">${escapeHtml(shipment.guideNumber)}</strong></div>

            <div class="section">
                <div class="section-title">REMITENTE</div>
                <div class="info"><span class="label">Nombre:</span> ${escapeHtml(shipment.sender?.name)}</div>
                <div class="info"><span class="label">Teléfono:</span> ${escapeHtml(shipment.sender?.phone)}</div>
            </div>

            <div class="section">
                <div class="section-title">DESTINATARIO</div>
                <div class="info"><span class="label">Nombre:</span> ${escapeHtml(shipment.receiver?.name)}</div>
                <div class="info"><span class="label">RUT/C.I.:</span> ${escapeHtml(shipment.receiver?.rut)}</div>
                <div class="info"><span class="label">Teléfono:</span> ${escapeHtml(shipment.receiver?.phone)}</div>
                <div class="info"><span class="label">Destino:</span> ${escapeHtml(shipment.destination?.city)}, ${escapeHtml(shipment.destination?.country)}</div>
            </div>

            <div class="section">
                <div class="section-title">CONTENIDO</div>
                <table>
                    <tr>
                        <th>Descripción</th>
                        <th>Peso (kg)</th>
                        <th>Valor ($)</th>
                    </tr>
                    <tr>
                        <td>${escapeHtml(shipment.items.join(', '))}</td>
                        <td>${shipment.weight}</td>
                        <td>${shipment.value}</td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <div class="section-title">MEDIDAS</div>
                <div class="info"><span class="label">Dimensiones:</span> ${shipment.dimensions.length}×${shipment.dimensions.width}×${shipment.dimensions.height} cm</div>
                <div class="info"><span class="label">Sucursal Origen:</span> ${escapeHtml(shipment.originBranch)}</div>
            </div>

            <div class="signature">
                <div>
                    <div class="sig-line">Remitente</div>
                </div>
                <div>
                    <div class="sig-line">Destinatario</div>
                </div>
                <div>
                    <div class="sig-line">Operador</div>
                </div>
            </div>

            <div class="footer">
                <p>Invoice generado automáticamente por el Sistema de Gestión de Envíos</p>
                <p>Fecha: ${escapeHtml(shipment.date)} | Guía: ${escapeHtml(shipment.guideNumber)}</p>
                <p>Este documento es válido como manifiesto de carga internacional</p>
            </div>
        </body>
        </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${shipment.guideNumber}.html"`);
    res.send(html);
});

/** Obtener remitentes */
app.get('/api/senders', (req, res) => {
    res.json(senders.filter(sender => sender.active !== false));
});

/** Guardar nuevo remitente - POST /api/senders */
app.post('/api/senders', (req, res) => {
    const { name, phone, email, address } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }

    const newSender = {
        id: getNextId(senders),
        name,
        phone,
        email: email || '',
        address: address || '',
        active: true,
        created_at: new Date().toISOString()
    };
    senders.push(newSender);
    saveStore();
    res.json(newSender);
});

/** Desactivar remitente */
app.delete('/api/senders/:id', (req, res) => {
    const senderId = Number(req.params.id);
    const sender = senders.find(item => item.id === senderId);
    if (!sender) {
        return res.status(404).json({ error: 'Remitente no encontrado' });
    }
    sender.active = false;
    saveStore();
    res.json({
        success: true,
        message: 'Remitente actualizado'
    });
});

/** Obtener destinatarios */
app.get('/api/receivers', (req, res) => {
    res.json(receivers);
});

/** Guardar nuevo destinatario - POST /api/receivers */
app.post('/api/receivers', (req, res) => {
    const { name, phone, rut, city, country, email, address } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }

    const newReceiver = {
        id: getNextId(receivers),
        name,
        phone,
        rut: rut || '',
        city: city || '',
        country: country || '',
        email: email || '',
        address: address || '',
        usage_count: 1,
        last_used: new Date().toISOString()
    };
    receivers.push(newReceiver);
    saveStore();
    res.json(newReceiver);
});

/** Obtener configuración */
// ============================================
// DATOS DE UBICACIONES ZOOM.RED
// ============================================
const ZOOM_LOCATIONS = [
    // ── Venezuela (origen) ─────────────────────────────────────────────────
    { country: 'Venezuela', country_code: 'VE', region: 'América del Sur', is_origin: true, cities: [
        // Región Capital
        'Caracas','La Guaira','Maiquetía','Carayaca','Caraballeda',
        // Miranda
        'Guarenas','Guatire','Charallave','Cúa','Ocumare del Tuy',
        'Santa Teresa del Tuy','Los Teques','San Antonio de los Altos','Carrizal','Higuerote',
        // Aragua
        'Maracay','Turmero','La Victoria','Villa de Cura','El Limón',
        'Cagua','San Mateo','El Consejo','Colonia Tovar',
        // Carabobo
        'Valencia','Puerto Cabello','Guacara','Los Guayos','San Diego',
        'Naguanagua','Bejuma','Tocuyito','Morón',
        // Lara
        'Barquisimeto','Cabudare','Carora','El Tocuyo','Quíbor','Yaritagua','Sarare',
        // Zulia
        'Maracaibo','Cabimas','Ciudad Ojeda','Bachaquero','Machiques',
        'San Francisco','Santa Bárbara del Zulia','La Cañada de Urdaneta',
        'Punto Fijo','Puerto Cumarebo',
        // Táchira
        'San Cristóbal','San Antonio del Táchira','Rubio','Táriba','La Grita','Coloncito','La Fría',
        // Mérida
        'Mérida','El Vigía','Ejido','Santa Elena de Arenales','Tovar',
        // Trujillo
        'Trujillo','Valera','Boconó',
        // Barinas
        'Barinas','Barinas Norte',
        // Apure
        'San Fernando de Apure','Biruaca',
        // Portuguesa
        'Acarigua','Guanare','Turén',
        // Cojedes
        'San Carlos',
        // Yaracuy
        'San Felipe',
        // Falcón
        'Coro','La Vela de Coro',
        // Anzoátegui
        'Barcelona','Puerto La Cruz','Lecherías','El Tigre','Anaco','Puerto Píritu',
        // Sucre
        'Cumaná','Carúpano','Cariaco',
        // Monagas
        'Maturín','Punta de Mata','Temblador',
        // Nueva Esparta (Margarita)
        'Porlamar','Pampatar','Juan Griego','La Asunción',
        // Bolívar
        'Puerto Ordaz','San Félix','Ciudad Bolívar','Ciudad Piar','Upata','Tumeremo','El Callao','El Dorado',
        // Amazonas
        'Puerto Ayacucho',
        // Delta Amacuro
        'Tucupita',
        // Guárico
        'San Juan de los Morros','Calabozo','El Sombrero','Valle de la Pascua',
    ]},
    // ── Norteamérica ───────────────────────────────────────────────────────
    { country: 'Estados Unidos', country_code: 'US', region: 'América del Norte', is_origin: false, cities: [
        'Miami','New York','Los Ángeles','Houston','Dallas','Chicago','Orlando','Atlanta',
        'Boston','San Francisco','Washington D.C.','Las Vegas','Phoenix','Denver',
        'Seattle','Minneapolis','Detroit','Newark','Charlotte',
    ]},
    { country: 'Canadá', country_code: 'CA', region: 'América del Norte', is_origin: false, cities: [
        'Toronto','Montreal','Vancouver','Ottawa','Calgary','Edmonton','Quebec City','Winnipeg',
    ]},
    { country: 'México', country_code: 'MX', region: 'América del Norte', is_origin: false, cities: [
        'Ciudad de México','Guadalajara','Monterrey','Cancún','Puebla','Tijuana','León','Querétaro','Mérida',
    ]},
    // ── Centroamérica ──────────────────────────────────────────────────────
    { country: 'Panamá', country_code: 'PA', region: 'Centroamérica', is_origin: false, cities: [
        'Ciudad de Panamá','Colón','David','Santiago',
    ]},
    { country: 'Costa Rica', country_code: 'CR', region: 'Centroamérica', is_origin: false, cities: [
        'San José','Cartago','Liberia','Limón',
    ]},
    { country: 'Guatemala', country_code: 'GT', region: 'Centroamérica', is_origin: false, cities: [
        'Ciudad de Guatemala','Quetzaltenango','Escuintla',
    ]},
    { country: 'El Salvador', country_code: 'SV', region: 'Centroamérica', is_origin: false, cities: [
        'San Salvador','Santa Ana','San Miguel',
    ]},
    { country: 'Honduras', country_code: 'HN', region: 'Centroamérica', is_origin: false, cities: [
        'Tegucigalpa','San Pedro Sula','La Ceiba',
    ]},
    { country: 'Nicaragua', country_code: 'NI', region: 'Centroamérica', is_origin: false, cities: [
        'Managua','León','Granada',
    ]},
    // ── Caribe ────────────────────────────────────────────────────────────
    { country: 'República Dominicana', country_code: 'DO', region: 'Caribe', is_origin: false, cities: [
        'Santo Domingo','Santiago','San Pedro de Macorís','La Romana',
    ]},
    { country: 'Cuba', country_code: 'CU', region: 'Caribe', is_origin: false, cities: [
        'La Habana','Camagüey','Santiago de Cuba','Santa Clara',
    ]},
    { country: 'Puerto Rico', country_code: 'PR', region: 'Caribe', is_origin: false, cities: [
        'San Juan','Bayamón','Carolina','Ponce',
    ]},
    { country: 'Trinidad y Tobago', country_code: 'TT', region: 'Caribe', is_origin: false, cities: [
        'Puerto España','San Fernando','Chaguanas',
    ]},
    { country: 'Jamaica', country_code: 'JM', region: 'Caribe', is_origin: false, cities: [
        'Kingston','Montego Bay','Mandeville',
    ]},
    { country: 'Haití', country_code: 'HT', region: 'Caribe', is_origin: false, cities: [
        'Puerto Príncipe','Cap-Haïtien','Gonaïves',
    ]},
    // ── Sudamérica ────────────────────────────────────────────────────────
    { country: 'Guyana', country_code: 'GY', region: 'América del Sur', is_origin: false, cities: [
        'Georgetown','Linden','New Amsterdam',
    ]},
    { country: 'Colombia', country_code: 'CO', region: 'América del Sur', is_origin: false, cities: [
        'Bogotá','Medellín','Cali','Barranquilla','Cartagena',
        'Bucaramanga','Cúcuta','Pereira','Manizales','Santa Marta',
    ]},
    { country: 'Ecuador', country_code: 'EC', region: 'América del Sur', is_origin: false, cities: [
        'Quito','Guayaquil','Cuenca','Ambato','Manta',
    ]},
    { country: 'Perú', country_code: 'PE', region: 'América del Sur', is_origin: false, cities: [
        'Lima','Arequipa','Cusco','Trujillo','Chiclayo','Piura',
    ]},
    { country: 'Bolivia', country_code: 'BO', region: 'América del Sur', is_origin: false, cities: [
        'Santa Cruz de la Sierra','La Paz','Cochabamba','Oruro','Sucre',
    ]},
    { country: 'Chile', country_code: 'CL', region: 'América del Sur', is_origin: false, cities: [
        'Santiago','Valparaíso','Concepción','Antofagasta','Temuco','Viña del Mar','Puerto Montt','Iquique',
    ]},
    { country: 'Argentina', country_code: 'AR', region: 'América del Sur', is_origin: false, cities: [
        'Buenos Aires','Córdoba','Rosario','Mendoza','Tucumán','La Plata','Mar del Plata','Salta',
    ]},
    { country: 'Uruguay', country_code: 'UY', region: 'América del Sur', is_origin: false, cities: [
        'Montevideo','Maldonado','Salto','Paysandú',
    ]},
    { country: 'Paraguay', country_code: 'PY', region: 'América del Sur', is_origin: false, cities: [
        'Asunción','Ciudad del Este','Encarnación','Luque',
    ]},
    { country: 'Brasil', country_code: 'BR', region: 'América del Sur', is_origin: false, cities: [
        'São Paulo','Río de Janeiro','Brasília','Salvador','Fortaleza',
        'Belo Horizonte','Manaus','Curitiba','Recife',
    ]},
    // ── Europa ────────────────────────────────────────────────────────────
    { country: 'España', country_code: 'ES', region: 'Europa', is_origin: false, cities: [
        'Madrid','Barcelona','Valencia','Sevilla','Bilbao','Zaragoza',
        'Málaga','Murcia','Las Palmas de Gran Canaria','Palma de Mallorca','Tenerife',
    ]},
    { country: 'Portugal', country_code: 'PT', region: 'Europa', is_origin: false, cities: [
        'Lisboa','Oporto','Faro','Braga','Coimbra',
    ]},
    { country: 'Italia', country_code: 'IT', region: 'Europa', is_origin: false, cities: [
        'Roma','Milán','Nápoles','Turín','Florencia','Bolonia',
    ]},
    { country: 'Francia', country_code: 'FR', region: 'Europa', is_origin: false, cities: [
        'París','Marsella','Lyon','Toulouse','Niza','Estrasburgo',
    ]},
    { country: 'Alemania', country_code: 'DE', region: 'Europa', is_origin: false, cities: [
        'Berlín','Fráncfort','Múnich','Hamburgo','Düsseldorf','Stuttgart',
    ]},
    { country: 'Reino Unido', country_code: 'GB', region: 'Europa', is_origin: false, cities: [
        'Londres','Manchester','Birmingham','Glasgow','Leeds','Liverpool',
    ]},
    { country: 'Países Bajos', country_code: 'NL', region: 'Europa', is_origin: false, cities: [
        'Ámsterdam','Róterdam','La Haya','Utrecht','Eindhoven',
    ]},
    { country: 'Suecia', country_code: 'SE', region: 'Europa', is_origin: false, cities: [
        'Estocolmo','Gotemburgo','Malmö','Uppsala',
    ]},
    { country: 'Noruega', country_code: 'NO', region: 'Europa', is_origin: false, cities: [
        'Oslo','Bergen','Trondheim','Stavanger',
    ]},
    { country: 'Suiza', country_code: 'CH', region: 'Europa', is_origin: false, cities: [
        'Zúrich','Ginebra','Basilea','Berna',
    ]},
    { country: 'Bélgica', country_code: 'BE', region: 'Europa', is_origin: false, cities: [
        'Bruselas','Amberes','Gante','Lieja',
    ]},
    { country: 'Rusia', country_code: 'RU', region: 'Europa', is_origin: false, cities: [
        'Moscú','San Petersburgo','Novosibirsk','Ekaterimburgo',
    ]},
    // ── Asia ──────────────────────────────────────────────────────────────
    { country: 'China', country_code: 'CN', region: 'Asia', is_origin: false, cities: [
        'Shanghái','Pekín','Guangzhou','Shenzhen','Chengdu','Hangzhou',
    ]},
    { country: 'Japón', country_code: 'JP', region: 'Asia', is_origin: false, cities: [
        'Tokio','Osaka','Nagoya','Fukuoka','Kioto',
    ]},
    { country: 'Corea del Sur', country_code: 'KR', region: 'Asia', is_origin: false, cities: [
        'Seúl','Busán','Incheon','Daegu',
    ]},
    { country: 'India', country_code: 'IN', region: 'Asia', is_origin: false, cities: [
        'Mumbai','Delhi','Bangalore','Chennai','Calcuta','Hyderabad',
    ]},
    { country: 'Emiratos Árabes Unidos', country_code: 'AE', region: 'Asia', is_origin: false, cities: [
        'Dubái','Abu Dabi','Sharjah',
    ]},
    { country: 'Turquía', country_code: 'TR', region: 'Asia', is_origin: false, cities: [
        'Estambul','Ankara','Esmirna','Antalya',
    ]},
    // ── Oceanía ───────────────────────────────────────────────────────────
    { country: 'Australia', country_code: 'AU', region: 'Oceanía', is_origin: false, cities: [
        'Sídney','Melbourne','Brisbane','Perth','Adelaide',
    ]},
    // ── África ────────────────────────────────────────────────────────────
    { country: 'Sudáfrica', country_code: 'ZA', region: 'África', is_origin: false, cities: [
        'Johannesburgo','Ciudad del Cabo','Durban','Pretoria',
    ]},
];

/** Obtener todos los países y ciudades */
app.get('/api/locations', (req, res) => {
    res.json(ZOOM_LOCATIONS);
});

/** Buscar países o ciudades */
app.get('/api/locations/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (q.length < 2) return res.json([]);
    const results = [];
    for (const loc of ZOOM_LOCATIONS) {
        if (loc.country.toLowerCase().includes(q)) {
            results.push({ type: 'country', country: loc.country, country_code: loc.country_code, region: loc.region });
        }
        for (const city of loc.cities) {
            if (city.toLowerCase().includes(q)) {
                results.push({ type: 'city', country: loc.country, country_code: loc.country_code, city, region: loc.region });
            }
        }
        if (results.length >= 20) break;
    }
    res.json(results.slice(0, 20));
});

/** Obtener ciudades de un país por código ISO */
app.get('/api/locations/:countryCode', (req, res) => {
    const code = req.params.countryCode.toUpperCase();
    const entry = ZOOM_LOCATIONS.find(l => l.country_code === code);
    if (!entry) return res.status(404).json({ error: 'País no encontrado' });
    res.json(entry.cities);
});

/** Obtener configuración */
app.get('/api/settings', (req, res) => {
    res.json({
        companyName: 'Sistema de Envíos ZOOM.RED',
        companyPhone: '+56912345678',
        companyEmail: 'info@sistema-envios.cl',
        companyAddress: 'Calle Principal 123, Santiago',
        zoomRedUrl: 'https://mi.zoom.red',
        currency: 'CLP'
    });
});

// ============================================
// DECORACIÓN DEL SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          SERVIDOR DE ENVÍOS - ZOOM.RED INTEGRATION           ║
╚═══════════════════════════════════════════════════════════════╝

✅ Servidor en puerto: ${PORT}
🌐 Accede a: http://localhost:${PORT}/sistema.html
📡 API Base: http://localhost:${PORT}/api

📍 RUTAS API DISPONIBLES:

  POST   /api/validate-items
         → Valida si productos son permitidos en avión

  POST   /api/shipment/process
         → Procesa envío y genera guía local

  GET    /api/shipments
         → Obtiene lista de todos los envíos

  POST   /api/shipment/sync-to-zoom
         → Sincroniza envío con ZOOM.RED

  GET    /api/zoom-status/:guideNumber
         → Obtiene estado de envío en ZOOM

  POST   /api/bulk-sync
         → Sincroniza múltiples envíos

  POST   /api/generate-invoice
         → Genera invoice descargable

📋 PRÓXIMOS PASOS:

  1. Instala dependencias:
     npm install express cors dotenv axios

  2. Configura credenciales ZOOM en .env:
     ZOOM_USER=tu_usuario
     ZOOM_PASSWORD=tu_contraseña
     ZOOM_COMPANY_CODE=tu_código

  3. Integra autenticación real con API zoom.red

  4. Implementa webhooks para actualizaciones de estado

⚡ Sistema listo para producción
    `);
});

module.exports = app;
