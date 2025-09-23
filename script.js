// Application State (extended)
let currentDate = new Date();
let devices = {};
let currentEditingIndex = null;
let currentFilter = 'all';
let isSelecting = false;
let selectedDevices = new Set();
let autoSaveInterval;
let clientSuggestions = new Set();
let deviceSuggestions = new Set();
let partsSuggestions = new Set();
let analytics = {};

// Status mappings
const statusLabels = {
    'received': '📥 Reçu',
    'diagnostic': '🔍 Diagnostic',
    'waiting': '⏳ Attente pièces',
    'repaired': '✅ Réparé',
    'delivered': '🚚 Livré'
};

const urgencyLabels = {
    'normal': '🟢 Normal',
    'urgent': '🟠 Urgent',
    'express': '🔴 Express'
};

const priorityLabels = {
    'normal': '🟢 Normale',
    'high': '🟠 Haute', 
    'critical': '🔴 Critique'
};

// QR Code Management
function generateDeviceQR(device, index) {
    const qrData = {
        id: `RB-${getDateKey()}-${index}`,
        client: device.client,
        model: device.model,
        date: device.date,
        status: device.status
    };
    return JSON.stringify(qrData);
}

function showQRCode(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    const qrData = generateDeviceQR(device, index);
    
    document.getElementById('qrModalTitle').textContent = `QR Code - ${device.model}`;
    
    // Generate QR Code
    const qrCodeDiv = document.getElementById('qrCodeDisplay');
    qrCodeDiv.innerHTML = '';
    
    if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(qrCodeDiv, qrData, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        }, function (error) {
            if (error) {
                qrCodeDiv.innerHTML = '<div style="padding: 20px; color: var(--accent-error);">Erreur génération QR Code</div>';
            }
        });
    } else {
        qrCodeDiv.innerHTML = '<div style="padding: 20px;">QR Code: ' + qrData + '</div>';
    }
    
    document.getElementById('qrModal').classList.add('active');
}

function closeQRModal() {
    document.getElementById('qrModal').classList.remove('active');
}

function generateQRLabel(index) {
    showQRCode(index);
}

function downloadQRCode() {
    const canvas = document.querySelector('#qrCodeDisplay canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = 'qr-code-repairbox.png';
        link.href = canvas.toDataURL();
        link.click();
    }
}

function printQRLabel() {
    const canvas = document.querySelector('#qrCodeDisplay canvas');
    if (canvas) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Étiquette QR - RepairBox</title></head>
                <body style="margin: 0; text-align: center;">
                    <img src="${canvas.toDataURL()}" style="max-width: 100%;">
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
}

// QR Code Scanner (basic implementation)
function startQRScan() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                // Note: Full QR scanning would require more complex video processing
                showNotification('Scanner QR: Fonctionnalité en développement', 'warning');
            })
            .catch(err => {
                showNotification('Erreur accès caméra: ' + err.message, 'error');
            });
    } else {
        showNotification('Scanner QR non supporté sur ce navigateur', 'error');
    }
}

// Photo Management and Reminders
function needsPhotoReminder(device) {
    // Show photo button if status is received and no photos, or repaired and no after photo
    return (device.status === 'received' && !device.photoBefore) || 
           (device.status === 'repaired' && !device.photoAfter);
}

function addDevicePhoto(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    
    // Determine which photo is needed
    const photoType = device.status === 'received' ? 'before' : 'after';
    
    // Trigger photo upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'camera'; // Prefer camera on mobile
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                device[`photo${photoType.charAt(0).toUpperCase() + photoType.slice(1)}`] = e.target.result;
                saveToStorage();
                updateDisplay();
                showNotification(`Photo ${photoType === 'before' ? 'avant' : 'après'} ajoutée`, 'success');
            };
            reader.readAsDataURL(file);
        }
    };
    
    input.click();
}

function checkPhotoReminders() {
    const dateKey = getDateKey();
    const dayDevices = devices[dateKey] || [];
    let needsPhoto = false;
    
    dayDevices.forEach(device => {
        if (needsPhotoReminder(device)) {
            needsPhoto = true;
        }
    });
    
    const reminder = document.getElementById('photoReminder');
    if (needsPhoto) {
        reminder.classList.remove('hidden');
        reminder.onclick = () => {
            // Find first device needing photo
            const index = dayDevices.findIndex(device => needsPhotoReminder(device));
            if (index !== -1) {
                addDevicePhoto(index);
            }
        };
    } else {
        reminder.classList.add('hidden');
    }
}

// Enhanced Analytics
function calculateAnalytics() {
    const allDevices = [];
    Object.keys(devices).forEach(date => {
        devices[date].forEach(device => {
            allDevices.push({...device, date});
        });
    });
    
    // Group by problem type
    const problemStats = {};
    const modelStats = {};
    
    allDevices.forEach(device => {
        // Problem analysis
        const problemKey = device.problem.toLowerCase();
        if (!problemStats[problemKey]) {
            problemStats[problemKey] = {
                count: 0,
                totalTime: 0,
                totalRevenue: 0,
                avgTime: 0,
                avgRevenue: 0
            };
        }
        
        problemStats[problemKey].count++;
        if (device.duration) problemStats[problemKey].totalTime += parseFloat(device.duration);
        if (device.price) problemStats[problemKey].totalRevenue += parseFloat(device.price);
        
        // Model analysis
        const modelKey = device.model.toLowerCase();
        if (!modelStats[modelKey]) {
            modelStats[modelKey] = { count: 0, revenue: 0 };
        }
        modelStats[modelKey].count++;
        if (device.price) modelStats[modelKey].revenue += parseFloat(device.price);
    });
    
    // Calculate averages
    Object.keys(problemStats).forEach(key => {
        const stat = problemStats[key];
        stat.avgTime = stat.count > 0 ? (stat.totalTime / stat.count).toFixed(1) : 0;
        stat.avgRevenue = stat.count > 0 ? (stat.totalRevenue / stat.count).toFixed(0) : 0;
    });
    
    return { problemStats, modelStats, totalDevices: allDevices.length };
}

function updateAnalytics() {
    const analyticsGrid = document.getElementById('analyticsGrid');
    if (!analyticsGrid) {
        console.log('Analytics grid not found, skipping analytics update');
        return;
    }
    
    const analytics = calculateAnalytics();
    
    // Get top problems
    const topProblems = Object.entries(analytics.problemStats)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 4);
    
    let analyticsHTML = '';
    
    if (topProblems.length > 0) {
        topProblems.forEach(([problem, stats]) => {
            analyticsHTML += `
                <div class="analytics-item">
                    <div class="analytics-number">${stats.avgTime}h</div>
                    <div class="analytics-label">Temps moyen<br>${problem.substring(0, 15)}...</div>
                </div>
            `;
        });
    } else {
        analyticsHTML = `
            <div class="analytics-item" style="grid-column: 1 / -1;">
                <div class="analytics-number">📊</div>
                <div class="analytics-label">Pas encore assez de données</div>
            </div>
        `;
    }
    
    analyticsGrid.innerHTML = analyticsHTML;
}

// Thermal Printer Support
function printThermalTicket(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    
    const ticketHTML = `
        <div class="thermal-ticket">
            <div class="thermal-header">
                REPAIRBOX
                <br>Ticket de Réparation
            </div>
            
            <div class="thermal-section">
                <div class="thermal-line">
                    <span>N° Ticket:</span>
                    <span>RB-${getDateKey()}-${index + 1}</span>
                </div>
                <div class="thermal-line">
                    <span>Date:</span>
                    <span>${new Date().toLocaleDateString('fr-FR')}</span>
                </div>
                <div class="thermal-line">
                    <span>Heure:</span>
                    <span>${device.time}</span>
                </div>
            </div>
            
            <div class="thermal-separator"></div>
            
            <div class="thermal-section">
                <strong>CLIENT:</strong><br>
                ${device.client}<br>
                ${device.phone || 'Tel: Non renseigné'}
            </div>
            
            <div class="thermal-separator"></div>
            
            <div class="thermal-section">
                <strong>APPAREIL:</strong><br>
                ${device.model}<br><br>
                <strong>PROBLÈME:</strong><br>
                ${device.problem}
            </div>
            
            <div class="thermal-separator"></div>
            
            <div class="thermal-section">
                <div class="thermal-line">
                    <span>Statut:</span>
                    <span>${statusLabels[device.status]}</span>
                </div>
                <div class="thermal-line">
                    <span>Urgence:</span>
                    <span>${urgencyLabels[device.urgency] || 'Normal'}</span>
                </div>
                <div class="thermal-line">
                    <span>Prix estimé:</span>
                    <span>${device.price ? device.price + '€' : 'À définir'}</span>
                </div>
                ${device.warranty ? `
                <div class="thermal-line">
                    <span>Garantie:</span>
                    <span>${device.warranty} mois</span>
                </div>` : ''}
            </div>
            
            <div class="thermal-separator"></div>
            
            <div class="thermal-qr">
                [QR CODE PLACEHOLDER]
                <br>ID: RB-${getDateKey()}-${index + 1}
            </div>
            
            <div class="thermal-footer">
                Merci de votre confiance<br>
                RepairBox - Votre spécialiste mobile<br>
                Conservez ce ticket
            </div>
        </div>
    `;
    
    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Ticket RepairBox</title>
                <style>
                    @media print {
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.2; color: black; background: white; }
                        .thermal-ticket { width: 80mm; margin: 0; padding: 5mm; }
                        .thermal-header { text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px dashed black; padding-bottom: 5px; }
                        .thermal-section { margin: 8px 0; }
                        .thermal-line { display: flex; justify-content: space-between; margin: 2px 0; }
                        .thermal-separator { border-top: 1px dashed black; margin: 8px 0; }
                        .thermal-qr { text-align: center; margin: 10px 0; }
                        .thermal-footer { text-align: center; font-size: 10px; margin-top: 10px; border-top: 1px dashed black; padding-top: 5px; }
                    }
                </style>
            </head>
            <body>${ticketHTML}</body>
        </html>
    `);
    printWindow.document.close();
    
    // Auto-print after a short delay
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
    
    showNotification('Ticket envoyé à l\'imprimante thermique', 'success');
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    showLoading(true);
    loadFromStorage();
    loadSampleDataIfEmpty();
    updateDisplay();
    startTimeTracking();
    startAutoSave();
    updateSuggestions();
    showLoading(false);
});

// Loading overlay
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// Save indicator
function updateSaveIndicator(status) {
    const indicator = document.getElementById('saveIndicator');
    const icon = document.getElementById('saveIcon');
    const text = document.getElementById('saveText');
    
    indicator.className = `save-indicator ${status}`;
    
    switch(status) {
        case 'saving':
            icon.textContent = '⏳';
            text.textContent = 'Sauvegarde...';
            break;
        case 'saved':
            icon.textContent = '✅';
            text.textContent = 'Sauvegardé';
            setTimeout(() => updateSaveIndicator('ready'), 2000);
            break;
        case 'error':
            icon.textContent = '❌';
            text.textContent = 'Erreur';
            setTimeout(() => updateSaveIndicator('ready'), 3000);
            break;
        default:
            icon.textContent = '💾';
            text.textContent = 'Prêt';
    }
}

// Time tracking
function startTimeTracking() {
    setInterval(updateTimeSpent, 60000); // Update every minute
}

function updateTimeSpent() {
    const dateKey = getDateKey();
    const dayDevices = devices[dateKey] || [];
    
    dayDevices.forEach(device => {
        if (device.status === 'diagnostic' || device.status === 'waiting') {
            const startTime = new Date(device.createdAt || new Date());
            const now = new Date();
            const hoursSpent = ((now - startTime) / (1000 * 60 * 60)).toFixed(1);
            device.timeSpent = hoursSpent;
        }
    });
    
    updateDisplay();
}

// Auto-save functionality
function startAutoSave() {
    autoSaveInterval = setInterval(() => {
        saveToStorage();
    }, 30000); // Save every 30 seconds
}

// Local Storage Management
function saveToStorage() {
    try {
        updateSaveIndicator('saving');
        const dataToSave = {
            devices: devices,
            clientSuggestions: Array.from(clientSuggestions),
            deviceSuggestions: Array.from(deviceSuggestions),
            partsSuggestions: Array.from(partsSuggestions),
            lastSaved: new Date().toISOString(),
            version: '2.0'
        };
        
        const jsonData = JSON.stringify(dataToSave);
        localStorage.setItem('repairbox_data', jsonData);
        
        updateSaveIndicator('saved');
        updateBackupInfo();
        
        console.log('Données sauvegardées:', Object.keys(devices).length, 'jours');
    } catch (e) {
        console.error('Erreur sauvegarde:', e);
        updateSaveIndicator('error');
        showNotification('Erreur de sauvegarde: ' + e.message, 'error');
    }
}

function loadFromStorage() {
    try {
        const savedData = localStorage.getItem('repairbox_data');
        if (savedData) {
            const data = JSON.parse(savedData);
            
            devices = data.devices || {};
            clientSuggestions = new Set(data.clientSuggestions || []);
            deviceSuggestions = new Set(data.deviceSuggestions || []);
            partsSuggestions = new Set(data.partsSuggestions || []);
            
            console.log('Données chargées:', Object.keys(devices).length, 'jours');
            updateBackupInfo();
            return true;
        }
    } catch (e) {
        console.error('Erreur chargement:', e);
        showNotification('Erreur de chargement des données', 'error');
    }
    return false;
}

function updateBackupInfo() {
    const backupInfo = document.getElementById('backupInfo');
    const savedData = localStorage.getItem('repairbox_data');
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            const lastSaved = new Date(data.lastSaved);
            backupInfo.textContent = `Dernière sauvegarde: ${lastSaved.toLocaleDateString('fr-FR')} à ${lastSaved.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}`;
        } catch (e) {
            backupInfo.textContent = 'Erreur lecture sauvegarde';
        }
    } else {
        backupInfo.textContent = 'Aucune sauvegarde';
    }
}

// Backup Management
function exportBackup() {
    try {
        const dataToExport = {
            devices: devices,
            clientSuggestions: Array.from(clientSuggestions),
            deviceSuggestions: Array.from(deviceSuggestions),
            partsSuggestions: Array.from(partsSuggestions),
            exportDate: new Date().toISOString(),
            version: '2.0'
        };
        
        const jsonData = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `RepairBox_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('💾 Sauvegarde exportée avec succès!', 'success');
    } catch (e) {
        console.error('Erreur export:', e);
        showNotification('Erreur lors de l\'export: ' + e.message, 'error');
    }
}

function importBackup() {
    document.getElementById('backupFileInput').click();
}

function handleBackupImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Validate structure
            if (!importedData.devices) {
                throw new Error('Fichier de sauvegarde invalide');
            }
            
            // Confirm import
            const deviceCount = Object.keys(importedData.devices).reduce((count, date) => 
                count + (importedData.devices[date] || []).length, 0);
            
            if (confirm(`Importer ${deviceCount} appareils? Cela remplacera toutes les données actuelles.`)) {
                devices = importedData.devices || {};
                clientSuggestions = new Set(importedData.clientSuggestions || []);
                deviceSuggestions = new Set(importedData.deviceSuggestions || []);
                partsSuggestions = new Set(importedData.partsSuggestions || []);
                
                saveToStorage();
                updateDisplay();
                updateSuggestions();
                
                showNotification(`📥 ${deviceCount} appareils importés avec succès!`, 'success');
            }
        } catch (e) {
            console.error('Erreur import:', e);
            showNotification('Erreur lors de l\'import: ' + e.message, 'error');
        }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Clear the input
}

function clearAllData() {
    if (confirm('⚠️ ATTENTION: Supprimer TOUTES les données de façon permanente?\n\nCette action est irréversible!')) {
        if (confirm('Êtes-vous vraiment sûr? Toutes les données seront perdues!')) {
            devices = {};
            clientSuggestions = new Set();
            deviceSuggestions = new Set();
            partsSuggestions = new Set();
            
            localStorage.removeItem('repairbox_data');
            
            updateDisplay();
            updateSuggestions();
            updateBackupInfo();
            
            showNotification('🗑️ Toutes les données ont été supprimées', 'warning');
        }
    }
}

// Suggestions Management
function updateSuggestions() {
    updateDatalist('clientsList', clientSuggestions);
    updateDatalist('devicesList', deviceSuggestions);
    updateDatalist('partsList', partsSuggestions);
}

function updateDatalist(id, suggestions) {
    const datalist = document.getElementById(id);
    datalist.innerHTML = '';
    suggestions.forEach(suggestion => {
        const option = document.createElement('option');
        option.value = suggestion;
        datalist.appendChild(option);
    });
}

function addToSuggestions(type, value) {
    if (!value || value.trim().length < 2) return;
    
    const cleanValue = value.trim();
    
    switch(type) {
        case 'client':
            clientSuggestions.add(cleanValue);
            break;
        case 'device':
            deviceSuggestions.add(cleanValue);
            break;
        case 'parts':
            cleanValue.split(',').forEach(part => {
                const trimmedPart = part.trim();
                if (trimmedPart.length > 1) {
                    partsSuggestions.add(trimmedPart);
                }
            });
            break;
    }
}

// Date management
function changeDay(direction) {
    currentDate.setDate(currentDate.getDate() + direction);
    updateDisplay();
}

function getDateKey() {
    return currentDate.toISOString().split('T')[0];
}

function updateDisplay() {
    updateDateDisplay();
    updateDeviceList();
    updateStats();
    updateReminders();
    updateAnalytics();
    checkPhotoReminders();
}

function updateDateDisplay() {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const dateStr = currentDate.toLocaleDateString('fr-FR', options);
    document.getElementById('currentDate').textContent = dateStr;
    document.getElementById('dayTitle').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// Device management
function updateDeviceList() {
    const dateKey = getDateKey();
    const dayDevices = devices[dateKey] || [];
    const deviceGrid = document.getElementById('deviceGrid');
    
    if (dayDevices.length === 0) {
        deviceGrid.innerHTML = `
            <div class="empty-state glass-darker">
                <div class="empty-icon">📱</div>
                <div class="empty-title">Aucun appareil aujourd'hui</div>
                <div class="empty-desc">Cliquez sur "Nouvel Appareil" pour commencer</div>
            </div>
        `;
        return;
    }

    deviceGrid.innerHTML = dayDevices.map((device, index) => createDeviceCard(device, index)).join('');
    applyCurrentFilter();
}

function createDeviceCard(device, index) {
    const urgencyClass = device.urgency ? `urgency-${device.urgency}` : 'urgency-normal';
    const statusLabel = statusLabels[device.status] || device.status;
    const timeSpent = device.timeSpent ? `<span class="time-spent">⏱️ ${device.timeSpent}h</span>` : '';
    const priorityIndicator = device.priority && device.priority !== 'normal' ? 
        `<div class="priority-indicator priority-${device.priority === 'critical' ? 'critical' : 'high'}"></div>` : '';
    const isSelected = selectedDevices.has(index);
    
    return `
        <div class="device-card glass-darker bounce-in ${urgencyClass} ${isSelecting ? 'selecting' : ''}" data-index="${index}">
            ${isSelecting ? `<div class="device-checkbox ${isSelecting ? 'visible' : ''} ${isSelected ? 'checked' : ''}" onclick="toggleDeviceSelection(${index})"></div>` : ''}
            ${priorityIndicator}
            <div class="card-header">
                <div class="device-info" onclick="${isSelecting ? `toggleDeviceSelection(${index})` : `editDevice(${index})`}">
                    <div class="device-title">${device.model}</div>
                    <div class="device-client">👤 ${device.client} ${device.phone ? '• ' + device.phone : ''}</div>
                </div>
                <div class="status-badge status-${device.status}">${statusLabel}</div>
            </div>
            
            <div class="card-problem" onclick="${isSelecting ? `toggleDeviceSelection(${index})` : `editDevice(${index})`}">
                🔧 ${device.problem}
            </div>
            
            ${device.parts || device.duration || device.warranty || device.timeSpent ? `
                <div class="card-meta">
                    ${device.parts ? `<div class="meta-item">🔧 ${device.parts}</div>` : ''}
                    ${device.duration ? `<div class="meta-item">⏱️ ${device.duration}h estimé</div>` : ''}
                    ${device.warranty ? `<div class="meta-item">🛡️ ${device.warranty}m</div>` : ''}
                    ${timeSpent}
                </div>
            ` : ''}
            
            <div class="card-footer">
                <div class="device-time">⏰ ${device.time}</div>
                <div class="device-price">${device.price ? device.price + '€' : 'Prix à définir'}</div>
            </div>
            
            ${!isSelecting ? `
                <div class="card-actions">
                    ${device.phone ? `<button class="action-btn btn-sms" onclick="sendSMS(${index})">📱 SMS</button>` : ''}
                    <button class="action-btn btn-print" onclick="printThermalTicket(${index})">🖨️ Ticket</button>
                    <button class="action-btn btn-qr" onclick="showQRCode(${index})">📱 QR</button>
                    ${needsPhotoReminder(device) ? `<button class="action-btn btn-photo" onclick="addDevicePhoto(${index})">📸 Photo</button>` : ''}
                    <div class="quick-actions-dropdown">
                        <button class="action-btn btn-invoice" onclick="toggleDropdown(${index})">⚙️ Actions</button>
                        <div class="dropdown-content" id="dropdown-${index}">
                            <button class="dropdown-item" onclick="generateInvoice(${index})">📄 Facture</button>
                            <button class="dropdown-item" onclick="duplicateDevice(${index})">📋 Dupliquer</button>
                            <button class="dropdown-item" onclick="showDeviceHistory(${index})">📊 Historique</button>
                            <button class="dropdown-item" onclick="generateQRLabel(${index})">🏷️ Étiquette QR</button>
                            <button class="dropdown-item" onclick="deleteDevice(${index})" style="color: var(--accent-error)">🗑️ Supprimer</button>
                        </div>
                    </div>
                    <button class="action-btn btn-edit" onclick="editDevice(${index})">✏️ Modifier</button>
                </div>
            ` : ''}
        </div>
    `;
}

// Modal management
function openDeviceModal() {
    currentEditingIndex = null;
    document.getElementById('deviceForm').reset();
    document.getElementById('modalTitle').textContent = '📱 Nouvel Appareil';
    document.getElementById('beforePreview').innerHTML = '📸<br><small>Avant</small>';
    document.getElementById('afterPreview').innerHTML = '📸<br><small>Après</small>';
    document.getElementById('deviceModal').classList.add('active');
}

function editDevice(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    currentEditingIndex = index;
    
    // Populate form
    document.getElementById('clientName').value = device.client;
    document.getElementById('clientPhone').value = device.phone || '';
    document.getElementById('deviceModel').value = device.model;
    document.getElementById('deviceProblem').value = device.problem;
    document.getElementById('devicePrice').value = device.price || '';
    document.getElementById('deviceDuration').value = device.duration || '';
    document.getElementById('deviceStatus').value = device.status;
    document.getElementById('deviceUrgency').value = device.urgency || 'normal';
    document.getElementById('devicePriority').value = device.priority || 'normal';
    document.getElementById('deviceParts').value = device.parts || '';
    document.getElementById('deviceWarranty').value = device.warranty || '3';
    
    document.getElementById('modalTitle').textContent = '✏️ Modifier Appareil';
    document.getElementById('deviceModal').classList.add('active');
}

function closeModal() {
    document.getElementById('deviceModal').classList.remove('active');
}

function handleSubmit(event) {
    event.preventDefault();
    
    const deviceData = {
        client: document.getElementById('clientName').value,
        phone: document.getElementById('clientPhone').value,
        model: document.getElementById('deviceModel').value,
        problem: document.getElementById('deviceProblem').value,
        price: document.getElementById('devicePrice').value,
        duration: document.getElementById('deviceDuration').value,
        status: document.getElementById('deviceStatus').value,
        urgency: document.getElementById('deviceUrgency').value,
        priority: document.getElementById('devicePriority').value,
        parts: document.getElementById('deviceParts').value,
        warranty: document.getElementById('deviceWarranty').value,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        date: getDateKey(),
        createdAt: new Date().toISOString()
    };

    // Add to suggestions
    addToSuggestions('client', deviceData.client);
    addToSuggestions('device', deviceData.model);
    addToSuggestions('parts', deviceData.parts);

    const dateKey = getDateKey();
    if (!devices[dateKey]) {
        devices[dateKey] = [];
    }

    if (currentEditingIndex !== null) {
        // Conserver la date de création originale lors de la modification
        if (devices[dateKey][currentEditingIndex].createdAt) {
            deviceData.createdAt = devices[dateKey][currentEditingIndex].createdAt;
        }
        devices[dateKey][currentEditingIndex] = deviceData;
        showNotification('✅ Appareil modifié !', 'success');
    } else {
        devices[dateKey].push(deviceData);
        showNotification('✅ Appareil ajouté !', 'success');
    }

    updateDisplay();
    updateSuggestions();
    closeModal();
    saveToStorage();
}

// Photo handling
function triggerPhotoUpload(type) {
    document.getElementById(type + 'Photo').click();
}

function handlePhotoUpload(type) {
    const fileInput = document.getElementById(type + 'Photo');
    const preview = document.getElementById(type + 'Preview');
    
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" class="photo-preview" alt="${type} photo">`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Filter and search
function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    applyCurrentFilter();
}

function filterDevices() {
    applyCurrentFilter();
}

function applyCurrentFilter() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.device-card');
    
    cards.forEach(card => {
        let show = true;
        
        // Apply search filter
        if (searchTerm) {
            const text = card.textContent.toLowerCase();
            show = text.includes(searchTerm);
        }
        
        // Apply status filter
        if (show && currentFilter !== 'all') {
            if (currentFilter === 'urgent') {
                show = card.classList.contains('urgency-urgent') || card.classList.contains('urgency-express');
            } else if (currentFilter === 'repaired') {
                show = card.querySelector('.status-repaired') !== null;
            }
        }
        
        card.style.display = show ? 'block' : 'none';
        if (show) {
            card.classList.add('fade-in');
        }
    });
}

// Statistics avec nouvelles métriques
function updateStats() {
    const dateKey = getDateKey();
    const dayDevices = devices[dateKey] || [];
    
    const total = dayDevices.length;
    const repaired = dayDevices.filter(d => d.status === 'repaired' || d.status === 'delivered').length;
    const pending = dayDevices.filter(d => d.status !== 'repaired' && d.status !== 'delivered').length;
    const urgent = dayDevices.filter(d => d.urgency === 'urgent' || d.urgency === 'express' || d.priority === 'high' || d.priority === 'critical').length;
    
    const revenue = dayDevices
        .filter(d => (d.status === 'repaired' || d.status === 'delivered') && d.price)
        .reduce((sum, d) => sum + parseFloat(d.price || 0), 0);

    const totalWorkload = dayDevices.reduce((sum, d) => sum + parseFloat(d.duration || 1), 0);
    const workloadPercent = Math.min((totalWorkload / 12) * 100, 100); // 12h = 100%

    document.getElementById('totalCount').textContent = total;
    document.getElementById('repairedCount').textContent = repaired;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('revenueCount').textContent = Math.round(revenue) + '€';
    document.getElementById('urgentCount').textContent = urgent;
    document.getElementById('todayEarnings').textContent = Math.round(revenue) + '€';
    document.getElementById('workloadPercent').textContent = Math.round(workloadPercent) + '%';
    document.getElementById('workloadFill').style.width = workloadPercent + '%';

    updateReminders();
}

function updateReminders() {
    const dateKey = getDateKey();
    const dayDevices = devices[dateKey] || [];
    const reminders = [];

    // Express devices
    const expressDevices = dayDevices.filter(d => d.urgency === 'express' && !['repaired', 'delivered'].includes(d.status));
    if (expressDevices.length > 0) {
        reminders.push(`🔴 ${expressDevices.length} appareil(s) express à traiter en priorité`);
    }

    // Critical priority
    const criticalDevices = dayDevices.filter(d => d.priority === 'critical' && !['repaired', 'delivered'].includes(d.status));
    if (criticalDevices.length > 0) {
        reminders.push(`⚠️ ${criticalDevices.length} appareil(s) critique(s)`);
    }

    // Waiting for parts
    const waitingDevices = dayDevices.filter(d => d.status === 'waiting');
    if (waitingDevices.length > 0) {
        reminders.push(`⏳ ${waitingDevices.length} appareil(s) en attente de pièces`);
    }

    // Ready for delivery
    const repairedDevices = dayDevices.filter(d => d.status === 'repaired');
    if (repairedDevices.length > 0) {
        reminders.push(`✅ ${repairedDevices.length} appareil(s) prêts pour livraison`);
    }

    const remindersList = document.getElementById('remindersList');
    if (reminders.length === 0) {
        remindersList.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-style: italic; text-align: center; padding: 20px;">✨ Aucun rappel aujourd\'hui</div>';
    } else {
        remindersList.innerHTML = reminders.map(reminder => 
            `<div class="reminder-item">${reminder}</div>`
        ).join('');
    }
}

// Sélection multiple
function toggleBulkSelect() {
    isSelecting = !isSelecting;
    selectedDevices.clear();
    
    if (isSelecting) {
        document.getElementById('bulkActions').classList.add('active');
    } else {
        document.getElementById('bulkActions').classList.remove('active');
    }
    
    updateDeviceList();
    updateSelectedCount();
}

function toggleDeviceSelection(index) {
    if (selectedDevices.has(index)) {
        selectedDevices.delete(index);
    } else {
        selectedDevices.add(index);
    }
    updateSelectedCount();
    updateDeviceList();
}

function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = selectedDevices.size;
}

// Actions groupées
function bulkChangeStatus() {
    if (selectedDevices.size === 0) {
        showNotification('Aucun appareil sélectionné', 'warning');
        return;
    }
    
    const newStatus = prompt('Nouveau statut (received/diagnostic/waiting/repaired/delivered):');
    if (newStatus && statusLabels[newStatus]) {
        const dateKey = getDateKey();
        selectedDevices.forEach(index => {
            if (devices[dateKey][index]) {
                devices[dateKey][index].status = newStatus;
            }
        });
        
        showNotification(`${selectedDevices.size} appareils mis à jour`, 'success');
        toggleBulkSelect();
        updateDisplay();
        saveToStorage();
    }
}

function bulkSendSMS() {
    if (selectedDevices.size === 0) {
        showNotification('Aucun appareil sélectionné', 'warning');
        return;
    }
    
    const message = prompt('Message à envoyer à tous les clients sélectionnés:');
    if (message) {
        const dateKey = getDateKey();
        let sentCount = 0;
        
        selectedDevices.forEach(index => {
            const device = devices[dateKey][index];
            if (device && device.phone) {
                const personalizedMessage = message.replace('{client}', device.client).replace('{model}', device.model);
                const smsUrl = `sms:${device.phone}?body=${encodeURIComponent(personalizedMessage)}`;
                window.open(smsUrl, '_blank');
                sentCount++;
            }
        });
        
        showNotification(`${sentCount} SMS ouverts`, 'success');
        toggleBulkSelect();
    }
}

function bulkDelete() {
    if (selectedDevices.size === 0) {
        showNotification('Aucun appareil sélectionné', 'warning');
        return;
    }
    
    if (confirm(`Supprimer ${selectedDevices.size} appareil(s) sélectionné(s) ?`)) {
        const dateKey = getDateKey();
        const sortedIndexes = Array.from(selectedDevices).sort((a, b) => b - a);
        
        sortedIndexes.forEach(index => {
            devices[dateKey].splice(index, 1);
        });
        
        showNotification(`${selectedDevices.size} appareils supprimés`, 'success');
        toggleBulkSelect();
        updateDisplay();
        saveToStorage();
    }
}

// Dropdown actions
function toggleDropdown(index) {
    // Fermer tous les autres dropdowns
    document.querySelectorAll('.dropdown-content').forEach(dropdown => {
        if (dropdown.id !== `dropdown-${index}`) {
            dropdown.classList.remove('show');
        }
    });
    
    // Toggle le dropdown actuel
    const dropdown = document.getElementById(`dropdown-${index}`);
    dropdown.classList.toggle('show');
}

// Actions
function sendSMS(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    
    const templates = {
        received: `Bonjour ${device.client}, nous avons bien reçu votre ${device.model} chez RepairBox. Diagnostic en cours, nous vous recontactons rapidement.`,
        diagnostic: `Bonjour ${device.client}, diagnostic effectué pour votre ${device.model}. Coût estimé: ${device.price || 'À définir'}€. Confirmez-vous la réparation?`,
        waiting: `Bonjour ${device.client}, votre ${device.model} est en attente de pièces. Livraison prévue sous 2-3 jours. Merci de votre patience.`,
        repaired: `Excellente nouvelle! Votre ${device.model} est réparé chez RepairBox. Montant: ${device.price || 'À définir'}€. Venez le récupérer!`,
        delivered: `Merci ${device.client} pour votre confiance. Votre ${device.model} bénéficie d'une garantie de ${device.warranty || 3} mois. À bientôt chez RepairBox!`
    };
    
    const message = templates[device.status] || templates.received;
    const smsUrl = `sms:${device.phone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_blank');
    showNotification('📱 SMS ouvert dans votre application');
}

function generateInvoice(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    
    const invoice = `
# REPAIRBOX - FACTURE

Date: ${new Date().toLocaleDateString('fr-FR')}
Heure: ${new Date().toLocaleTimeString('fr-FR')}

## CLIENT:
Nom: ${device.client}
Téléphone: ${device.phone || 'Non renseigné'}

## APPAREIL:
Modèle: ${device.model}
Problème: ${device.problem}
Statut: ${statusLabels[device.status]}

## DÉTAILS RÉPARATION:
Pièces utilisées: ${device.parts || 'Aucune'}
Temps passé: ${device.duration || 'Non défini'} heures
Garantie: ${device.warranty || '3'} mois

## MONTANT:
Total TTC: ${device.price || '0'}€

Merci de votre confiance !
RepairBox - Votre spécialiste réparation mobile
    `;

    const blob = new Blob([invoice], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RepairBox_Facture_${device.client.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('📄 Facture téléchargée !');
    toggleDropdown(index);
}

// Dupliquer un appareil
function duplicateDevice(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    const newDevice = {
        ...device,
        client: device.client + ' (copie)',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        status: 'received',
        createdAt: new Date().toISOString()
    };
    
    devices[dateKey].push(newDevice);
    updateDisplay();
    saveToStorage();
    showNotification('Appareil dupliqué', 'success');
    toggleDropdown(index);
}

// Supprimer un appareil
function deleteDevice(index) {
    if (confirm('Supprimer cet appareil ?')) {
        const dateKey = getDateKey();
        devices[dateKey].splice(index, 1);
        updateDisplay();
        saveToStorage();
        showNotification('Appareil supprimé', 'success');
    }
    toggleDropdown(index);
}

// Historique des appareils
function showDeviceHistory(index) {
    const dateKey = getDateKey();
    const device = devices[dateKey][index];
    
    // Chercher l'historique du client
    const clientDevices = [];
    Object.keys(devices).forEach(date => {
        devices[date].forEach(d => {
            if (d.client.toLowerCase() === device.client.toLowerCase()) {
                clientDevices.push({...d, date});
            }
        });
    });
    
    clientDevices.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let historyText = `HISTORIQUE ${device.client.toUpperCase()}\n\n`;
    clientDevices.forEach(d => {
        historyText += `📱 ${d.model} - ${statusLabels[d.status]}\n`;
        historyText += `📅 ${new Date(d.date).toLocaleDateString('fr-FR')} à ${d.time}\n`;
        historyText += `🔧 ${d.problem}\n`;
        historyText += `💰 ${d.price || 'Gratuit'}€\n\n`;
    });
    
    console.log(historyText);
    showNotification(`📊 Historique de ${device.client} affiché en console`, 'success');
    toggleDropdown(index);
}

function exportDay() {
    const dateKey = getDateKey();
    const dayDevices = devices[dateKey] || [];
    
    if (dayDevices.length === 0) {
        showNotification('⚠️ Aucun appareil à exporter aujourd\'hui');
        return;
    }
    
    const dateStr = currentDate.toLocaleDateString('fr-FR');
    let exportText = `REPAIRBOX - RAPPORT JOURNALIER\n`;
    exportText += `=====================================================\n`;
    exportText += `Date: ${dateStr}\n`;
    exportText += `Total appareils: ${dayDevices.length}\n\n`;
    
    dayDevices.forEach((device, i) => {
        exportText += `${i + 1}. ${device.model}\n`;
        exportText += `   Client: ${device.client}${device.phone ? ' (' + device.phone + ')' : ''}\n`;
        exportText += `   Problème: ${device.problem}\n`;
        exportText += `   Statut: ${statusLabels[device.status]}\n`;
        exportText += `   Urgence: ${urgencyLabels[device.urgency] || 'Normal'}\n`;
        exportText += `   Prix: ${device.price || 'À définir'}€\n`;
        exportText += `   Pièces: ${device.parts || 'Aucune'}\n`;
        exportText += `   Heure: ${device.time}\n\n`;
    });
    
    const stats = getStatsForDay(dayDevices);
    exportText += `STATISTIQUES:\n`;
    exportText += `- Total: ${stats.total}\n`;
    exportText += `- Réparés: ${stats.repaired}\n`;
    exportText += `- En cours: ${stats.pending}\n`;
    exportText += `- Revenus: ${stats.revenue}€\n`;
    
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RepairBox_Rapport_${dateKey}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('📋 Rapport exporté !');
}

function showWeekStats() {
    let totalWeek = 0;
    let revenueWeek = 0;
    let repairedWeek = 0;
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const dayDevices = devices[dateKey] || [];
        
        totalWeek += dayDevices.length;
        repairedWeek += dayDevices.filter(d => d.status === 'repaired' || d.status === 'delivered').length;
        revenueWeek += dayDevices
            .filter(d => (d.status === 'repaired' || d.status === 'delivered') && d.price)
            .reduce((sum, d) => sum + parseFloat(d.price || 0), 0);
    }
    
    const statsMsg = `📊 STATISTIQUES SEMAINE\n\nTotal appareils: ${totalWeek}\nRéparés: ${repairedWeek}\nChiffre d'affaires: ${Math.round(revenueWeek)}€\nMoyenne/jour: ${(totalWeek/7).toFixed(1)} appareils`;
    
    console.log(statsMsg);
    showNotification('📊 Stats semaine affichées en console', 'success');
}

// Historique des clients
function showClientHistory() {
    const allClients = {};
    
    Object.keys(devices).forEach(date => {
        devices[date].forEach(device => {
            const clientKey = device.client.toLowerCase();
            if (!allClients[clientKey]) {
                allClients[clientKey] = {
                    name: device.client,
                    phone: device.phone,
                    devices: [],
                    totalSpent: 0,
                    lastVisit: date
                };
            }
            
            allClients[clientKey].devices.push({...device, date});
            if (device.price && (device.status === 'repaired' || device.status === 'delivered')) {
                allClients[clientKey].totalSpent += parseFloat(device.price);
            }
            
            if (date > allClients[clientKey].lastVisit) {
                allClients[clientKey].lastVisit = date;
            }
        });
    });
    
    const sortedClients = Object.values(allClients)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);
    
    let report = 'TOP 10 CLIENTS REPAIRBOX\n\n';
    sortedClients.forEach((client, i) => {
        report += `${i + 1}. ${client.name}\n`;
        report += `   📱 ${client.phone || 'Pas de téléphone'}\n`;
        report += `   💰 ${client.totalSpent.toFixed(0)}€ dépensés\n`;
        report += `   📱 ${client.devices.length} appareil(s)\n`;
        report += `   📅 Dernière visite: ${new Date(client.lastVisit).toLocaleDateString('fr-FR')}\n\n`;
    });
    
    console.log(report);
    showNotification('📊 Historique clients affiché en console', 'success');
}

function getStatsForDay(dayDevices) {
    const total = dayDevices.length;
    const repaired = dayDevices.filter(d => d.status === 'repaired' || d.status === 'delivered').length;
    const pending = total - repaired;
    const revenue = dayDevices
        .filter(d => (d.status === 'repaired' || d.status === 'delivered') && d.price)
        .reduce((sum, d) => sum + parseFloat(d.price || 0), 0);
    
    return { total, repaired, pending, revenue: Math.round(revenue) };
}

// Navigation
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const messages = {
        planning: '📅 Onglet Planning actif',
        clients: '👥 Gestion clients (à venir)',
        stats: '📊 Statistiques avancées (à venir)',
        stock: '📦 Gestion stock (à venir)'
    };
    
    showNotification(messages[tab] || 'Onglet sélectionné');
}

// Notifications améliorées
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

// Raccourcis clavier
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
        if (isSelecting) toggleBulkSelect();
        document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('show'));
    }
    
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'n':
                e.preventDefault();
                openDeviceModal();
                break;
            case 's':
                e.preventDefault();
                exportDay();
                break;
            case 'a':
                if (isSelecting) {
                    e.preventDefault();
                    const dateKey = getDateKey();
                    const dayDevices = devices[dateKey] || [];
                    dayDevices.forEach((_, index) => selectedDevices.add(index));
                    updateSelectedCount();
                    updateDeviceList();
                }
                break;
        }
    }
});

// Fermer les dropdowns en cliquant ailleurs
document.addEventListener('click', function(e) {
    if (!e.target.closest('.quick-actions-dropdown')) {
        document.querySelectorAll('.dropdown-content').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});

// Données d'exemple enrichies
function loadSampleDataIfEmpty() {
    // Charger seulement si aucune donnée n'existe
    if (Object.keys(devices).length === 0) {
        loadSampleData();
    }
}

function loadSampleData() {
    const today = getDateKey();
    const yesterday = new Date(currentDate);
    yesterday.setDate(currentDate.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    
    // Today's data avec nouvelles fonctionnalités
    devices[today] = [
        {
            client: 'Sarah Benali',
            phone: '06 12 34 56 78',
            model: 'iPhone 15 Pro Max',
            problem: 'Écran fissuré après chute, tactile partiellement défaillant',
            price: '320',
            status: 'diagnostic',
            urgency: 'urgent',
            priority: 'high',
            parts: 'Écran OLED, Protection verre',
            duration: '2.5',
            warranty: '6',
            time: '09:15',
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            timeSpent: '2.0'
        },
        {
            client: 'Mohamed Chourak',
            phone: '07 89 01 23 45',
            model: 'Samsung Galaxy S24 Ultra',
            problem: 'Batterie se décharge très rapidement, surchauffe anormale',
            price: '95',
            status: 'waiting',
            urgency: 'normal',
            priority: 'normal',
            parts: 'Batterie Samsung originale',
            duration: '1',
            warranty: '12',
            time: '10:30',
            createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            timeSpent: '1.0'
        },
        {
            client: 'Fatima Zahra',
            phone: '06 55 44 33 22',
            model: 'iPhone 13 Mini',
            problem: 'Problème de charge, connecteur Lightning défaillant',
            price: '75',
            status: 'repaired',
            urgency: 'normal',
            priority: 'normal',
            parts: 'Connecteur Lightning',
            duration: '1.5',
            warranty: '3',
            time: '14:20',
            createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
        },
        {
            client: 'Karim El Fassi',
            phone: '06 98 76 54 32',
            model: 'Xiaomi Redmi Note 12',
            problem: 'Caméra arrière floue, objectif rayé suite à chute',
            price: '45',
            status: 'received',
            urgency: 'express',
            priority: 'critical',
            parts: 'Module caméra principal',
            duration: '0.5',
            warranty: '3',
            time: '16:45',
            createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        },
        {
            client: 'Aisha Benjelloun',
            phone: '07 11 22 33 44',
            model: 'iPhone 14',
            problem: 'Écran noir, ne s\'allume plus après choc violent',
            price: '180',
            status: 'delivered',
            urgency: 'normal',
            priority: 'normal',
            parts: 'Écran LCD, batterie',
            duration: '3',
            warranty: '6',
            time: '11:00',
            createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        }
    ];
    
    // Yesterday's sample data pour l'historique
    devices[yesterdayKey] = [
        {
            client: 'Omar Alami',
            phone: '06 77 88 99 00',
            model: 'iPhone 12',
            problem: 'Batterie gonflée, remplacement nécessaire',
            price: '80',
            status: 'delivered',
            urgency: 'urgent',
            priority: 'high',
            parts: 'Batterie',
            duration: '1',
            warranty: '6',
            time: '10:00',
            createdAt: yesterday.toISOString()
        },
        {
            client: 'Sarah Benali',
            phone: '06 12 34 56 78',
            model: 'iPhone 15 Pro Max',
            problem: 'Installation protection écran',
            price: '25',
            status: 'delivered',
            urgency: 'normal',
            priority: 'normal',
            parts: 'Protection verre trempé',
            duration: '0.25',
            warranty: '1',
            time: '15:30',
            createdAt: yesterday.toISOString()
        }
    ];

    // Ajouter aux suggestions
    devices[today].concat(devices[yesterdayKey]).forEach(device => {
        addToSuggestions('client', device.client);
        addToSuggestions('device', device.model);
        addToSuggestions('parts', device.parts);
    });

    saveToStorage();
}

// Gestion des erreurs globales
window.addEventListener('error', function(e) {
    console.error('Erreur application:', e.error);
    showNotification('Une erreur s\'est produite. Vérifiez la console.', 'error');
});

// Avant fermeture de la page
window.addEventListener('beforeunload', function(e) {
    saveToStorage();
});

// Performance monitoring
function logPerformance() {
    const deviceCount = Object.keys(devices).reduce((count, date) => 
        count + (devices[date] || []).length, 0);
    
    console.log(`📊 Performance RepairBox:
- Total appareils: ${deviceCount}
- Jours de données: ${Object.keys(devices).length}
- Taille stockage: ${JSON.stringify(devices).length} caractères
- Suggestions clients: ${clientSuggestions.size}
- Suggestions appareils: ${deviceSuggestions.size}
- Suggestions pièces: ${partsSuggestions.size}`);
}

// Log performance au démarrage
setTimeout(logPerformance, 2000);