const API_BASE = 'http://localhost:3000/api';
const API_AUTH_TOKEN_KEY = 'apiAuthToken';
const API_AUTH_USER_KEY = 'apiAuthUser';

let shipments = [];
let currentShipment = null;
let senders = [];
let receivers = [];
let locationsData = [];
let appDataLoaded = false;
let appDataLoading = false;

const prohibitedItems = [
    'Explosivos', 'Inflamables', 'Pesticidas', 'Químicos peligrosos',
    'Radiactivos', 'Litio', 'Gases', 'Líquidos peligrosos', 'Fuegos artificiales', 'Armas'
];

function getApiAuthToken() {
    return sessionStorage.getItem(API_AUTH_TOKEN_KEY) || '';
}

function setAccessStatus(message, type = 'info') {
    const status = document.getElementById('accessStatus');
    if (!status) return;
    status.className = `alert alert-${type} show`;
    status.textContent = message;
}

function clearAccessStatus() {
    const status = document.getElementById('accessStatus');
    if (!status) return;
    status.className = 'alert';
    status.textContent = '';
}

function buildBasicToken(user, password) {
    return btoa(`${user}:${password}`);
}

function loadApiAccessFromSession() {
    document.getElementById('apiAccessUser').value = sessionStorage.getItem(API_AUTH_USER_KEY) || '';
    document.getElementById('apiAccessPassword').value = '';
}

function clearLocalAccess(showMessage = true) {
    sessionStorage.removeItem(API_AUTH_TOKEN_KEY);
    sessionStorage.removeItem(API_AUTH_USER_KEY);
    loadApiAccessFromSession();
    appDataLoaded = false;
    if (showMessage) {
        setAccessStatus('Acceso local eliminado. Ingresa credenciales para continuar.', 'warning');
        switchTab('configuracion');
    }
}

async function apiCall(endpoint, options = {}) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        const authToken = getApiAuthToken();
        if (authToken) {
            headers.Authorization = `Basic ${authToken}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            clearLocalAccess(false);
            setAccessStatus('Credenciales inválidas o expiradas. Vuelve a autenticarte.', 'danger');
            switchTab('configuracion');
            throw new Error('No autorizado');
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        if (error.message !== 'No autorizado') {
            showAlert('Error de conexión con el servidor', 'danger');
        }
        throw error;
    }
}

async function ensureApiAuth() {
    if (getApiAuthToken()) {
        clearAccessStatus();
        return true;
    }

    setAccessStatus('Ingresa el usuario y contraseña del acceso local para habilitar la API.', 'warning');
    switchTab('configuracion');
    return false;
}

async function initializeAppData(force = false) {
    if (appDataLoading || (appDataLoaded && !force)) {
        return;
    }

    appDataLoading = true;
    try {
        await loadSenders();
        await setupReceiverAutocomplete();
        await loadShipments();
        await loadSendersList();
        await loadReceiversList();
        await loadDestCountries();
        loadOriginBranches();
        appDataLoaded = true;
    } finally {
        appDataLoading = false;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById('today').textContent = new Date().toLocaleDateString('es-ES');
    document.getElementById('shipmentForm').addEventListener('submit', processShipment);
    loadSettings();
    loadApiAccessFromSession();

    if (await ensureApiAuth()) {
        try {
            await initializeAppData();
        } catch (error) {
            console.error('Error en inicialización:', error);
        }
    }
});

async function saveLocalAccess() {
    const user = document.getElementById('apiAccessUser').value.trim();
    const password = document.getElementById('apiAccessPassword').value;

    if (!user || !password) {
        setAccessStatus('Usuario y contraseña del acceso local son obligatorios.', 'danger');
        return;
    }

    sessionStorage.setItem(API_AUTH_TOKEN_KEY, buildBasicToken(user, password));
    sessionStorage.setItem(API_AUTH_USER_KEY, user);

    try {
        await apiCall('/settings');
        setAccessStatus('Acceso local verificado correctamente.', 'success');
        await initializeAppData(true);
    } catch (error) {
        clearLocalAccess(false);
        setAccessStatus('No se pudo validar el acceso local. Revisa las credenciales.', 'danger');
    }
}

async function loadDestCountries() {
    try {
        locationsData = await apiCall('/locations');
        const select = document.getElementById('destCountry');
        select.innerHTML = '<option value="">-- País --</option>';

        const regions = {};
        locationsData.forEach(loc => {
            if (!regions[loc.region]) regions[loc.region] = [];
            regions[loc.region].push(loc);
        });

        const veData = locationsData.find(l => l.country_code === 'VE');
        if (veData) {
            const opt = document.createElement('option');
            opt.value = veData.country_code;
            opt.textContent = `🇻🇪 ${veData.country} (Nacional)`;
            select.appendChild(opt);
        }

        const regionOrder = ['América del Norte', 'Centroamérica', 'Caribe', 'América del Sur', 'Europa', 'Asia', 'Oceanía', 'África'];
        regionOrder.forEach(region => {
            if (!regions[region]) return;
            const group = document.createElement('optgroup');
            group.label = `── ${region} ──`;
            regions[region]
                .filter(l => l.country_code !== 'VE')
                .forEach(loc => {
                    const opt = document.createElement('option');
                    opt.value = loc.country_code;
                    opt.textContent = loc.country;
                    group.appendChild(opt);
                });
            if (group.children.length > 0) select.appendChild(group);
        });
    } catch (error) {
        console.error('Error cargando países:', error);
    }
}

async function loadDestCities() {
    const countryCode = document.getElementById('destCountry').value;
    const citySelect = document.getElementById('destCity');
    citySelect.innerHTML = '<option value="">-- Ciudad --</option>';

    if (!countryCode) return;

    try {
        const cities = await apiCall(`/locations/${countryCode}`);
        cities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            citySelect.appendChild(opt);
        });
    } catch (error) {
        console.error('Error cargando ciudades:', error);
    }
}

function loadOriginBranches() {
    const branches = [
        { value: 'CARACAS-LA_HOYADA', label: 'Caracas – La Hoyada (Principal)' },
        { value: 'CARACAS-ALTAMIRA', label: 'Caracas – Altamira' },
        { value: 'CARACAS-LA_CALIFORNIA', label: 'Caracas – La California' },
        { value: 'CARACAS-SAN_MARTIN', label: 'Caracas – San Martín' },
        { value: 'CARACAS-EL_MARQUES', label: 'Caracas – El Marqués' },
        { value: 'CARACAS-LOS_RUICES', label: 'Caracas – Los Ruices' },
        { value: 'CARACAS-PARQUE_HUMBOLDT', label: 'Caracas – Parque Humboldt' },
        { value: 'CARACAS-SAMBIL', label: 'Caracas – Sambil La Candelaria' },
        { value: 'CARACAS-CCCT', label: 'Caracas – C.C.C.T.' },
        { value: 'GUARENAS', label: 'Guarenas – C.C. Miranda' },
        { value: 'GUATIRE', label: 'Guatire – C.C. Castillejo' },
        { value: 'CHARALLAVE', label: 'Charallave – Ciudad Concordia' },
        { value: 'MARACAY-LAS_AMERICAS', label: 'Maracay – C.C. Las Américas' },
        { value: 'MARACAY-METRO', label: 'Maracay – C.C. Metropolis' },
        { value: 'La_VICTORIA', label: 'La Victoria – Victoria Center' },
        { value: 'TURMERO', label: 'Turmero – Intercomunal' },
        { value: 'VALENCIA-METRO', label: 'Valencia – C.C. Metropolis' },
        { value: 'VALENCIA-CENTRO', label: 'Valencia – Centro' },
        { value: 'GUACARA', label: 'Guacara – C.C. Central' },
        { value: 'BARQUISIMETO-CENTRO', label: 'Barquisimeto – Centro' },
        { value: 'BARQUISIMETO-AEROPUERTO', label: 'Barquisimeto – Aeropuerto J. Lara' },
        { value: 'CABUDARE', label: 'Cabudare – C.C. Libertador' },
        { value: 'MARACAIBO-PRINCIPAL', label: 'Maracaibo – Av. 5 de Julio (Principal)' },
        { value: 'MARACAIBO-LA_CHINITA', label: 'Maracaibo – C.C. La Chinita' },
        { value: 'MARACAIBO-GRAN_BAZAR', label: 'Maracaibo – C.C. Gran Bazar' },
        { value: 'CIUDAD_OJEDA', label: 'Ciudad Ojeda' },
        { value: 'CABIMAS', label: 'Cabimas' },
        { value: 'SAN_CRISTOBAL', label: 'San Cristóbal – 5ta Avenida' },
        { value: 'SAN_ANTONIO_TACHIRA', label: 'San Antonio del Táchira' },
        { value: 'MERIDA_CENTRO', label: 'Mérida – Centro' },
        { value: 'EL_VIGIA', label: 'El Vigía' },
        { value: 'BARCELONA', label: 'Barcelona – C.C. Brisas del Neverí' },
        { value: 'PUERTO_LA_CRUZ', label: 'Puerto La Cruz – Hotel Rasil' },
        { value: 'LECHERIAS', label: 'Lechería – Casco Central' },
        { value: 'EL_TIGRE', label: 'El Tigre – C.C. El Alba' },
        { value: 'CUMANA', label: 'Cumaná – C.C. Marina Plaza' },
        { value: 'CARUPANO', label: 'Carúpano – Centro' },
        { value: 'MATURIN_PRINCIPAL', label: 'Maturín – Av. Bicentenario (Principal)' },
        { value: 'PORLAMAR', label: 'Porlamar – Terminal Margarita' },
        { value: 'PAMPATAR_SAMBIL', label: 'Pampatar – Sambil Margarita' },
        { value: 'PUERTO_ORDAZ', label: 'Puerto Ordaz – Zona Industrial' },
        { value: 'CIUDAD_BOLIVAR', label: 'Ciudad Bolívar – Av. Germania' },
        { value: 'SAN_FELIX', label: 'San Félix – La Cariñosa' },
        { value: 'SAN_JUAN_MORROS', label: 'San Juan de los Morros' },
        { value: 'CALABOZO', label: 'Calabozo' },
        { value: 'SAN_FERNANDO', label: 'San Fernando de Apure' },
        { value: 'PUERTO_AYACUCHO', label: 'Puerto Ayacucho – C.C. Juncosa' },
        { value: 'TUCUPITA', label: 'Tucupita – Casco Centro' },
        { value: 'ACARIGUA', label: 'Acarigua – C.C. Sol de Curpa' },
        { value: 'GUANARE', label: 'Guanare' },
        { value: 'SAN_FELIPE', label: 'San Felipe – C.C. Aracoi' },
        { value: 'BARINAS', label: 'Barinas – Centro' },
        { value: 'TRUJILLO', label: 'Trujillo – C.C. Solunto' },
        { value: 'PUNTO_FIJO', label: 'Punto Fijo – Calle Falcón' }
    ];

    const select = document.getElementById('originBranch');
    select.innerHTML = '<option value="">-- Selecciona sucursal --</option>';
    branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.value;
        option.textContent = branch.label;
        select.appendChild(option);
    });
}

async function loadSenders() {
    try {
        const sendersData = await apiCall('/senders');
        senders = sendersData;
        window.senders = senders;

        const select = document.getElementById('sender');
        select.innerHTML = '<option value="">-- Selecciona remitente --</option>';

        senders.forEach(sender => {
            const option = document.createElement('option');
            option.value = sender.id;
            option.textContent = sender.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando remitentes:', error);
    }
}

function loadSenderPhone() {
    const senderId = document.getElementById('sender').value;
    if (senderId && window.senders) {
        const sender = window.senders.find(s => s.id == senderId);
        if (sender) {
            document.getElementById('senderPhone').value = sender.phone;
        }
    }
}

async function setupReceiverAutocomplete() {
    try {
        const receiversData = await apiCall('/receivers');
        receivers = receiversData;
        window.receivers = receivers;

        const receiverInput = document.getElementById('receiver');
        let suggestionsDiv = document.getElementById('receiverSuggestions');
        if (suggestionsDiv) {
            suggestionsDiv.remove();
        }
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'receiverSuggestions';
        suggestionsDiv.className = 'autocomplete-suggestions';
        suggestionsDiv.style.cssText = [
            'position: absolute',
            'top: 100%',
            'left: 0',
            'right: 0',
            'background: white',
            'border: 1px solid #ddd',
            'border-radius: 4px',
            'max-height: 200px',
            'overflow-y: auto',
            'z-index: 1000',
            'display: none'
        ].join(';');
        receiverInput.parentNode.style.position = 'relative';
        receiverInput.parentNode.appendChild(suggestionsDiv);

        receiverInput.oninput = function () {
            const query = this.value.toLowerCase();
            suggestionsDiv.innerHTML = '';

            if (query.length < 2) {
                suggestionsDiv.style.display = 'none';
                return;
            }

            const matches = receivers.filter(r =>
                r.name.toLowerCase().includes(query) ||
                r.phone.includes(query)
            ).slice(0, 5);

            if (matches.length > 0) {
                matches.forEach(receiver => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
                    const nameStrong = document.createElement('strong');
                    nameStrong.textContent = receiver.name;
                    const lineBreak = document.createElement('br');
                    const details = document.createElement('small');
                    details.textContent = `📞 ${receiver.phone} | 📊 ${receiver.usage_count} envíos`;
                    div.appendChild(nameStrong);
                    div.appendChild(lineBreak);
                    div.appendChild(details);
                    div.onmouseover = () => div.style.background = '#f8f9fa';
                    div.onmouseout = () => div.style.background = 'white';
                    div.onclick = () => selectReceiver(receiver);
                    suggestionsDiv.appendChild(div);
                });
                suggestionsDiv.style.display = 'block';
            } else {
                suggestionsDiv.style.display = 'none';
            }
        };

        document.addEventListener('click', function(e) {
            if (!receiverInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
                suggestionsDiv.style.display = 'none';
            }
        });
    } catch (error) {
        console.error('Error configurando autocompletado:', error);
    }
}

function selectReceiver(receiver) {
    document.getElementById('receiver').value = receiver.name;
    document.getElementById('receiverRUT').value = receiver.rut || '';
    document.getElementById('receiverPhone').value = receiver.phone;
    document.getElementById('receiverSuggestions').style.display = 'none';
    window.selectedReceiverId = receiver.id;
}

async function saveReceiverIfNew() {
    const name = document.getElementById('receiver').value.trim();
    const phone = document.getElementById('receiverPhone').value.trim();
    const rut = document.getElementById('receiverRUT').value.trim();

    if (!name || !phone) return null;

    const existing = receivers.find(r =>
        r.name.toLowerCase() === name.toLowerCase() && r.phone === phone
    );

    if (existing) {
        return existing.id;
    }

    try {
        const newReceiver = await apiCall('/receivers', {
            method: 'POST',
            body: JSON.stringify({
                name,
                rut,
                phone,
                email: '',
                address: ''
            })
        });

        receivers.push(newReceiver);
        window.receivers = receivers;
        return newReceiver.id;
    } catch (error) {
        console.error('Error guardando destinatario:', error);
        return null;
    }
}

async function loadShipments() {
    try {
        const shipmentsData = await apiCall('/shipments');
        shipments = shipmentsData || [];
        displayShipments(shipments);
        updateStats(shipments);
    } catch (error) {
        console.error('Error cargando envíos:', error);
        shipments = [];
    }
}

function displayShipments(items) {
    const container = document.getElementById('shipmentsList');

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state">Sin envíos aún</div>';
        return;
    }

    container.innerHTML = items.map(shipment => `
        <div class="shipment-item">
            <strong>📦 ${escapeHtml(shipment.guideNumber || shipment.id)}</strong>
            ${shipment.zoom_guide_number ? `<span class="guide-highlight">${escapeHtml(shipment.zoom_guide_number)}</span>` : ''}
            <div class="shipment-detail">👤 ${escapeHtml(shipment.sender?.name || '')} → ${escapeHtml(shipment.receiver?.name || '')}</div>
            <div class="shipment-detail">📍 ${escapeHtml(shipment.destination?.city || '')}, ${escapeHtml(shipment.destination?.country || '')}</div>
            <div class="shipment-detail">⚖️ ${shipment.weight}kg | 💰 $${shipment.value} | 📅 ${new Date(shipment.date).toLocaleDateString('es-ES')}</div>
            <div class="shipment-detail">📝 ${escapeHtml(Array.isArray(shipment.items) ? shipment.items.join(', ') : shipment.items)}</div>
        </div>
    `).join('');
}

function updateStats(items) {
    const total = items.length;
    const validated = items.filter(s => s.status === 'completed').length;
    const pending = total - validated;
    const totalWeight = items.reduce((sum, s) => sum + (s.weight || 0), 0);

    document.getElementById('totalShipments').textContent = total;
    document.getElementById('validatedCount').textContent = validated;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('totalWeight').textContent = totalWeight.toFixed(1);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
}

async function processShipment(e) {
    e.preventDefault();

    if (!validateForm()) return;

    const items = document.getElementById('items').value;
    const validation = validateItems(items);
    if (!validation.isValid) {
        showAlert(`❌ PROHIBIDO: ${validation.prohibited.join(', ')} no puede ir en avión`, 'danger');
        return;
    }

    showAlert('Procesando envío...', 'warning');

    try {
        const receiverId = await saveReceiverIfNew();
        if (!receiverId) {
            showAlert('Error guardando destinatario', 'danger');
            return;
        }

        const senderId = document.getElementById('sender').value;
        const senderObj = senders.find(s => s.id == senderId);
        const shipmentData = {
            sender: {
                name: senderObj?.name || '',
                phone: document.getElementById('senderPhone').value
            },
            receiver: {
                name: document.getElementById('receiver').value.trim(),
                rut: document.getElementById('receiverRUT').value.trim(),
                phone: document.getElementById('receiverPhone').value.trim()
            },
            destination: {
                country: getSelectedCountryName(),
                city: document.getElementById('destCity').value
            },
            originBranch: document.getElementById('originBranch').value,
            items: document.getElementById('items').value,
            weight: parseFloat(document.getElementById('weight').value),
            value: parseFloat(document.getElementById('value').value),
            dimensions: {
                length: parseFloat(document.getElementById('length').value),
                width: parseFloat(document.getElementById('width').value),
                height: parseFloat(document.getElementById('height').value)
            }
        };

        const response = await apiCall('/shipment/process', {
            method: 'POST',
            body: JSON.stringify(shipmentData)
        });

        currentShipment = response.shipment || response;
        if (response.guideNumber) currentShipment.guideNumber = response.guideNumber;

        showAlert('✅ Envío procesado exitosamente!', 'success');
        document.getElementById('invoiceSection').style.display = 'block';
        updateZoomPreview();
        await loadShipments();
    } catch (error) {
        console.error('Error procesando envío:', error);
        showAlert('Error procesando el envío', 'danger');
    }
}

async function updateZoomGuide() {
    const zoomGuide = document.getElementById('zoomGuideNumber').value.trim();
    if (!zoomGuide || !currentShipment) return;

    currentShipment.zoom_guide_number = zoomGuide;
    showAlert('✅ Guía ZOOM actualizada!', 'success');
    await loadShipments();
}

async function addNewSender() {
    const name = document.getElementById('newSenderName').value.trim();
    const phone = document.getElementById('newSenderPhone').value.trim();
    const email = document.getElementById('newSenderEmail').value.trim();
    const address = document.getElementById('newSenderAddress').value.trim();

    if (!name || !phone) {
        showAlert('Nombre y teléfono son obligatorios', 'danger');
        return;
    }

    try {
        await apiCall('/senders', {
            method: 'POST',
            body: JSON.stringify({ name, phone, email, address })
        });

        showAlert('✅ Remitente agregado exitosamente!', 'success');
        document.getElementById('newSenderName').value = '';
        document.getElementById('newSenderPhone').value = '';
        document.getElementById('newSenderEmail').value = '';
        document.getElementById('newSenderAddress').value = '';
        await loadSendersList();
        await loadSenders();
    } catch (error) {
        console.error('Error agregando remitente:', error);
        showAlert('Error agregando remitente', 'danger');
    }
}

async function loadSendersList() {
    try {
        const sendersData = await apiCall('/senders');
        const container = document.getElementById('sendersList');

        if (sendersData.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay remitentes registrados</div>';
            return;
        }

        container.innerHTML = sendersData.map(sender => `
            <div class="shipment-item">
                <strong>👤 ${escapeHtml(sender.name)}</strong>
                <div class="shipment-detail">📞 ${escapeHtml(sender.phone)}</div>
                ${sender.email ? `<div class="shipment-detail">📧 ${escapeHtml(sender.email)}</div>` : ''}
                ${sender.address ? `<div class="shipment-detail">📍 ${escapeHtml(sender.address)}</div>` : ''}
                <div class="shipment-detail">📅 Creado: ${new Date(sender.created_at).toLocaleDateString('es-ES')}</div>
                <button class="btn-secondary" onclick="toggleSenderStatus(${sender.id})" style="margin-top: 8px; font-size: 11px;">
                    ${sender.active ? '🚫 Desactivar' : '✅ Activar'}
                </button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando remitentes:', error);
    }
}

async function toggleSenderStatus(senderId) {
    try {
        await apiCall(`/senders/${senderId}`, { method: 'DELETE' });
        showAlert('Estado del remitente actualizado', 'success');
        await loadSendersList();
        await loadSenders();
    } catch (error) {
        console.error('Error cambiando estado:', error);
        showAlert('Error actualizando remitente', 'danger');
    }
}

async function addNewReceiver() {
    const name = document.getElementById('newReceiverName').value.trim();
    const rut = document.getElementById('newReceiverRUT').value.trim();
    const phone = document.getElementById('newReceiverPhone').value.trim();
    const email = document.getElementById('newReceiverEmail').value.trim();

    if (!name || !phone) {
        showAlert('Nombre y teléfono son obligatorios', 'danger');
        return;
    }

    try {
        await apiCall('/receivers', {
            method: 'POST',
            body: JSON.stringify({ name, rut, phone, email, address: '' })
        });

        showAlert('✅ Destinatario agregado exitosamente!', 'success');
        document.getElementById('newReceiverName').value = '';
        document.getElementById('newReceiverRUT').value = '';
        document.getElementById('newReceiverPhone').value = '';
        document.getElementById('newReceiverEmail').value = '';
        await loadReceiversList();
        await setupReceiverAutocomplete();
    } catch (error) {
        console.error('Error agregando destinatario:', error);
        showAlert('Error agregando destinatario', 'danger');
    }
}

async function loadReceiversList() {
    try {
        const receiversData = await apiCall('/receivers');
        const container = document.getElementById('receiversList');

        if (receiversData.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay destinatarios registrados</div>';
            return;
        }

        receiversData.sort((a, b) => b.usage_count - a.usage_count);

        container.innerHTML = receiversData.map(receiver => `
            <div class="shipment-item">
                <strong>👥 ${escapeHtml(receiver.name)}</strong>
                <div class="shipment-detail">📞 ${escapeHtml(receiver.phone)}</div>
                ${receiver.rut ? `<div class="shipment-detail">🆔 ${escapeHtml(receiver.rut)}</div>` : ''}
                ${receiver.email ? `<div class="shipment-detail">📧 ${escapeHtml(receiver.email)}</div>` : ''}
                <div class="shipment-detail">📊 ${receiver.usage_count} envíos | Último: ${receiver.last_used ? new Date(receiver.last_used).toLocaleDateString('es-ES') : 'Nunca'}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando destinatarios:', error);
    }
}

async function downloadManifestExcel() {
    try {
        const items = await apiCall('/shipments');
        const data = items.map(s => ({
            'Número de Guía': s.guideNumber || s.id || '',
            'Guía ZOOM': s.zoom_guide_number || '',
            'Remitente': s.sender?.name || '',
            'Destinatario': s.receiver?.name || '',
            'Teléfono Destinatario': s.receiver?.phone || '',
            'País': s.destination?.country || '',
            'Ciudad': s.destination?.city || '',
            'Descripción': Array.isArray(s.items) ? s.items.join(', ') : s.items,
            'Peso (kg)': s.weight,
            'Valor ($)': s.value,
            'Fecha': new Date(s.date).toLocaleDateString('es-ES'),
            'Estado': s.status
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Manifiesto');
        XLSX.writeFile(wb, `manifiesto_${new Date().toISOString().split('T')[0]}.xlsx`);
        showAlert('✅ Manifiesto Excel descargado!', 'success');
    } catch (error) {
        console.error('Error descargando Excel:', error);
        showAlert('Error descargando manifiesto', 'danger');
    }
}

async function downloadManifestCSV() {
    try {
        const items = await apiCall('/shipments');
        const headers = ['Número de Guía', 'Guía ZOOM', 'Remitente', 'Destinatario', 'Teléfono Destinatario', 'País', 'Ciudad', 'Descripción', 'Peso (kg)', 'Valor ($)', 'Fecha', 'Estado'];
        const csvContent = [
            headers.join(','),
            ...items.map(s => [
                s.guideNumber || s.id || '',
                s.zoom_guide_number || '',
                `"${s.sender?.name || ''}"`,
                `"${s.receiver?.name || ''}"`,
                s.receiver?.phone || '',
                s.destination?.country || '',
                s.destination?.city || '',
                `"${Array.isArray(s.items) ? s.items.join(', ') : s.items}"`,
                s.weight,
                s.value,
                new Date(s.date).toLocaleDateString('es-ES'),
                s.status
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `manifiesto_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showAlert('✅ Manifiesto CSV descargado!', 'success');
    } catch (error) {
        console.error('Error descargando CSV:', error);
        showAlert('Error descargando manifiesto', 'danger');
    }
}

async function printManifest() {
    try {
        const items = await apiCall('/shipments');
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Manifiesto de Envíos</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        h1 { text-align: center; color: #2a5298; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f0f0f0; }
                    </style>
                </head>
                <body>
                    <h1>📦 Manifiesto de Envíos Internacionales</h1>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
                    <p><strong>Total de envíos:</strong> ${items.length}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Guía</th>
                                <th>ZOOM</th>
                                <th>Remitente</th>
                                <th>Destinatario</th>
                                <th>Destino</th>
                                <th>Peso</th>
                                <th>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(s => `
                                <tr>
                                    <td>${escapeHtml(s.guideNumber || s.id || '')}</td>
                                    <td>${escapeHtml(s.zoom_guide_number || '-')}</td>
                                    <td>${escapeHtml(s.sender?.name || '')}</td>
                                    <td>${escapeHtml(s.receiver?.name || '')}</td>
                                    <td>${escapeHtml(s.destination?.city || '')}, ${escapeHtml(s.destination?.country || '')}</td>
                                    <td>${s.weight}kg</td>
                                    <td>$${s.value}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    } catch (error) {
        console.error('Error imprimiendo:', error);
        showAlert('Error imprimiendo manifiesto', 'danger');
    }
}

function validateForm() {
    const required = ['sender', 'senderPhone', 'receiver', 'receiverPhone', 'destCountry', 'destCity', 'originBranch', 'items', 'weight', 'value', 'length', 'width', 'height'];
    for (const field of required) {
        if (!document.getElementById(field).value.trim()) {
            showAlert(`Campo obligatorio faltante: ${field}`, 'danger');
            return false;
        }
    }
    return true;
}

function validateItems(items) {
    const itemsArray = items.split(',').map(i => i.trim().toLowerCase());
    const prohibited = itemsArray.filter(item =>
        prohibitedItems.some(p => item.includes(p.toLowerCase()))
    );
    return { isValid: prohibited.length === 0, prohibited };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSelectedCountryName() {
    const select = document.getElementById('destCountry');
    const selectedOption = select.options[select.selectedIndex];
    return selectedOption ? selectedOption.textContent.replace(/^🇻🇪\s*/, '').replace(/\s*\(Nacional\)$/, '') : '';
}

function showAlert(message, type = 'info') {
    const alertDiv = document.getElementById('alertMessage');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.classList.add('show');
    setTimeout(() => { alertDiv.classList.remove('show'); }, 5000);
}

function updateZoomPreview() {
    if (!currentShipment) return;
    const preview = document.getElementById('zoomPreview');
    preview.innerHTML = `
        <div style="text-align: left; line-height: 1.6;">
            <strong>📦 Envío #${escapeHtml(currentShipment.guideNumber || currentShipment.id)}</strong><br>
            <strong>👤 Remitente:</strong> ${escapeHtml(currentShipment.sender?.name || '')}<br>
            <strong>👥 Destinatario:</strong> ${escapeHtml(currentShipment.receiver?.name || '')}<br>
            <strong>📍 Destino:</strong> ${escapeHtml(currentShipment.destination?.city || '')}, ${escapeHtml(currentShipment.destination?.country || '')}<br>
            <strong>⚖️ Peso:</strong> ${currentShipment.weight}kg<br>
            <strong>💰 Valor:</strong> $${currentShipment.value}<br>
            <strong>📝 Contenido:</strong> ${escapeHtml(Array.isArray(currentShipment.items) ? currentShipment.items.join(', ') : currentShipment.items)}
        </div>
    `;
}

function downloadInvoice() {
    if (!currentShipment) return;
    const guideNum = currentShipment.guideNumber || currentShipment.id;
    const itemsStr = escapeHtml(Array.isArray(currentShipment.items) ? currentShipment.items.join(', ') : currentShipment.items);
    const invoiceHTML = `
        <html><head><title>Invoice - ${guideNum}</title>
        <style>body{font-family:Arial;padding:40px;max-width:800px;margin:0 auto;}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #2a5298;padding-bottom:20px;}.details{line-height:1.8;}.total{font-weight:bold;font-size:18px;margin-top:20px;}</style>
        </head><body>
        <div class="header"><h1>🧾 INVOICE DE ENVÍO INTERNACIONAL</h1>
        <h2>Número de Guía: ${escapeHtml(guideNum)}</h2>
        ${currentShipment.zoom_guide_number ? `<h3>Guía ZOOM: ${escapeHtml(currentShipment.zoom_guide_number)}</h3>` : ''}</div>
        <div class="details">
        <p><strong>Fecha:</strong> ${new Date(currentShipment.date).toLocaleDateString('es-ES')}</p>
        <p><strong>Remitente:</strong> ${escapeHtml(currentShipment.sender?.name || '')}</p>
        <p><strong>Destinatario:</strong> ${escapeHtml(currentShipment.receiver?.name || '')}</p>
        <p><strong>Destino:</strong> ${escapeHtml(currentShipment.destination?.city || '')}, ${escapeHtml(currentShipment.destination?.country || '')}</p>
        <p><strong>Contenido:</strong> ${itemsStr}</p>
        <p><strong>Peso:</strong> ${currentShipment.weight} kg</p>
        <div class="total"><p><strong>Valor Declarado: $${currentShipment.value}</strong></p></div>
        </div></body></html>`;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.print();
}

function syncToZoom() {
    if (!currentShipment) return;
    window.open('https://mi.zoom.red/', '_blank');
    showAlert('🔄 Abriendo ZOOM.RED. Inicia sesión manualmente y usa la guía mostrada en pantalla.', 'info');
}

function saveCompanySettings() {
    const settings = {
        name: document.getElementById('companyName').value,
        rif: document.getElementById('companyRIF').value,
        phone: document.getElementById('companyPhone').value,
        email: document.getElementById('companyEmail').value
    };
    localStorage.setItem('companySettings', JSON.stringify(settings));
    showAlert('✅ Configuración guardada', 'success');
}

function saveZoomSettings() {
    const settings = {
        user: document.getElementById('zoomUser').value,
        code: document.getElementById('zoomCode').value
    };
    sessionStorage.setItem('zoomSettings', JSON.stringify(settings));
    showAlert('✅ Credenciales ZOOM guardadas solo para esta sesión', 'success');
}

function loadSettings() {
    const company = JSON.parse(localStorage.getItem('companySettings') || '{}');
    const zoom = JSON.parse(sessionStorage.getItem('zoomSettings') || '{}');
    document.getElementById('companyName').value = company.name || '';
    document.getElementById('companyRIF').value = company.rif || '';
    document.getElementById('companyPhone').value = company.phone || '';
    document.getElementById('companyEmail').value = company.email || '';
    document.getElementById('zoomUser').value = zoom.user || '';
    document.getElementById('zoomCode').value = zoom.code || '';
}
