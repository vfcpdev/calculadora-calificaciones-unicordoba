import { AttendanceModel } from './AttendanceModel.js';
import { ScannerService } from './ScannerService.js';
import { QRService } from './QRService.js';
import { ExportService } from './ExportService.js';

/**
 * Main application controller.
 * Responsibility: Orchestrating the UI and services.
 */
class AppController {
    constructor() {
        this.model = new AttendanceModel();
        this.exportService = new ExportService();
        this.qrService = new QRService();
        
        // Initialize UI Elements
        this.video = document.getElementById("qr-video");
        this.canvas = document.getElementById("qr-canvas");
        
        this.scanner = new ScannerService(this.video, this.canvas, (data) => this.handleScan(data));
        
        this.setupEventListeners();
        this.renderInitialUI();
    }

    setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target));
        });

        // Excel Import
        const excelInput = document.getElementById('excel-input');
        if (excelInput) {
            excelInput.addEventListener('change', (e) => this.handleExcelImport(e));
        }

        // Camera Activation
        const camBtn = document.getElementById('btn-activate-camera');
        if (camBtn) {
            camBtn.addEventListener('click', () => this.startScanner());
        }

        // File-based QR Scan
        const qrFileInput = document.getElementById('qr-file-input');
        if (qrFileInput) {
            qrFileInput.addEventListener('change', (e) => this.handleFileScan(e));
        }

        // Export Button
        const exportBtn = document.getElementById('btn-export-attendance');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }

        // Global Reset
        const resetBtn = document.getElementById('btn-reset-data');
        if (resetBtn) {
            resetBtn.onclick = () => {
                if (confirm('¿Seguro que deseas borrar toda la memoria RAM de la aplicación?')) {
                    this.model.clearData();
                    window.location.reload();
                }
            };
        }

        // Modal Close
        const closeBtn = document.getElementById('btn-close-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.stopScanner());
        }
    }

    async handleFileScan(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                const tctx = tempCanvas.getContext('2d');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tctx.drawImage(img, 0, 0);
                const imageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && code.data) {
                    this.handleScan(code.data);
                    this.showToast('✅ QR procesado desde archivo');
                } else {
                    this.showToast('❌ No se encontró un código QR válido en la imagen', 'error');
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    renderInitialUI() {
        this.updateStats();
        this.updateAttendanceTable();
        if (this.model.students.length > 0) {
            this.generateStudentQRCards();
            this.showFileStatus();
        }
    }

    switchTab(targetBtn) {
        const tabId = targetBtn.getAttribute('data-tab');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(tabId).classList.add('active');
        targetBtn.classList.add('active');

        if (tabId !== 'scanner') {
            this.stopScanner();
        }
    }

    async handleExcelImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const students = await this.exportService.parseExcel(file);
            this.model.setStudents(students);
            this.renderInitialUI();
            this.showToast(`Cargados ${students.length} estudiantes correctamente`);
        } catch (err) {
            console.error(err);
            this.showToast('Error al leer el archivo Excel', 'error');
        }
    }

    startScanner() {
        const modal = document.getElementById('scanner-modal');
        const status = document.getElementById('modal-status');
        const container = document.getElementById('reader-container');
        
        // Force immediate visibility
        if (modal) {
            modal.style.display = 'flex';
            modal.style.zIndex = '9999';
        }
        if (container) container.style.display = 'block';
        if (status) {
            status.innerText = '⌛ Conectando con la cámara...';
            status.style.color = 'var(--text-muted)';
        }

        // Attempt camera start
        this.scanner.start().then(() => {
            if (status) status.innerText = '📷 Cámara activa - Enfoca el QR';
            this.showToast('✅ Escáner activado');
        }).catch(err => {
            console.error('Camera Error:', err);
            if (status) {
                status.innerHTML = `
                    <div style="color:var(--danger); margin-bottom:1rem;">⚠️ Error de Cámara: ${err.message}</div>
                    <button class="btn btn-secondary" onclick="app.startScanner()" style="font-size:0.8rem; padding:0.5rem 1rem;">
                        🔄 Reintentar Conexión
                    </button>
                    <p style="font-size:0.8rem; margin-top:1rem; opacity:0.7;">Cierra otras apps que usen la cámara y pulsa reintentar.</p>
                `;
            }
        });
    }

    stopScanner() {
        const modal = document.getElementById('scanner-modal');
        if (modal) modal.style.display = 'none';
        this.scanner.stop();
    }

    handleScan(decodedText) {
        const sanitized = this.model.sanitizeID(decodedText);
        
        // Anti-bounce
        if (this.lastScannedId === sanitized && (Date.now() - this.lastScannedTime) < 5000) return;

        const student = this.model.getStudentById(decodedText);
        const now = new Date();
        
        const logEntry = {
            id: student ? student.id : decodedText,
            fullName: student ? student.fullName : "Desconocido (QR Externo)",
            date: now.toLocaleDateString(),
            time: now.toLocaleTimeString(),
            timestampRaw: now.toISOString(),
            matched: !!student
        };

        this.model.addLog(logEntry);
        this.lastScannedId = sanitized;
        this.lastScannedTime = Date.now();

        this.updateAttendanceTable();
        this.updateStats();
        
        // Success Feedback
        if (student) {
            this.playSuccessSound();
            this.triggerVisualFlash();
            if (window.confetti) confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ['#6366f1', '#10b981'] });
            this.showToast(`✅ Presente: ${student.fullName}`, 'success');
        } else {
            this.showToast(`⚠️ QR no reconocido`, 'error');
        }
    }

    playSuccessSound() {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            osc.frequency.value = 880; 
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
            osc.start();
            osc.stop(context.currentTime + 0.5);
        } catch (e) { console.warn('Audio feedback failed'); }
    }

    triggerVisualFlash() {
        const container = document.getElementById('reader-container');
        if (container) {
            container.style.boxShadow = '0 0 100px #10b981';
            setTimeout(() => {
                container.style.boxShadow = '0 0 50px rgba(99, 102, 241, 0.2)';
            }, 3000);
        }
    }

    generateStudentQRCards() {
        const grid = document.getElementById('qr-preview-grid');
        grid.innerHTML = '';
        
        this.model.students.forEach(s => {
            const item = document.createElement('div');
            item.className = 'qr-item';
            item.innerHTML = `
                <div style="font-weight:700; color:var(--primary); font-size:1rem; margin-bottom:0.5rem;">${s.fullName}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem; font-family:monospace;">ID: ${s.id}</div>
                <div class="qr-container"></div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.5rem;">
                    <a class="btn btn-primary" style="width:100%; font-size:0.85rem; opacity:0.5; pointer-events:none;">Generando...</a>
                    <button class="btn btn-secondary btn-simulate" style="width:100%; font-size:0.85rem;">⚡ Simular Escaneo</button>
                </div>
            `;
            grid.appendChild(item);

            const container = item.querySelector('.qr-container');
            const downloadLink = item.querySelector('a');
            const simulateBtn = item.querySelector('.btn-simulate');
            
            this.qrService.generateQR(container, s.id);
            this.qrService.getQRDataURL(container).then(dataUrl => {
                if (dataUrl) {
                    downloadLink.href = dataUrl;
                    downloadLink.download = `QR_${s.id}_${s.fullName}.png`;
                    downloadLink.style.opacity = '1';
                    downloadLink.style.pointerEvents = 'auto';
                    downloadLink.textContent = `⬇️ Descargar QR`;
                }
            });

            simulateBtn.addEventListener('click', () => {
                this.handleScan(s.id);
                this.showToast(`Simulación: QR de ${s.fullName} detectado`);
            });
        });
    }

    updateStats() {
        const stats = this.model.getStats();
        document.getElementById('count-students').innerText = stats.total;
        document.getElementById('count-present').innerText = stats.present;
        document.getElementById('percent-present').innerText = `${stats.percentage}%`;
    }

    updateAttendanceTable() {
        const tbody = document.querySelector('#attendance-table tbody');
        tbody.innerHTML = '';

        this.model.students.forEach(student => {
            const record = this.model.logs.find(log => log.id === student.id);
            const tr = document.createElement('tr');
            
            if (record) {
                tr.innerHTML = `
                    <td style="color: var(--primary); font-family: monospace;">${student.id}</td>
                    <td style="font-weight: 700;" colspan="2">${student.fullName}</td>
                    <td>${record.date}</td>
                    <td style="font-family: monospace; color: var(--secondary);">${record.time}</td>
                    <td><span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--secondary);">Presente ✓</span></td>
                `;
            } else {
                tr.innerHTML = `
                    <td style="color: var(--text-muted); font-family: monospace;">${student.id}</td>
                    <td style="color: var(--text-muted); font-weight: 500;" colspan="2">${student.fullName}</td>
                    <td style="color: transparent;">--/--/----</td>
                    <td style="color: transparent;">--:--:--</td>
                    <td><span class="status-badge" style="background: rgba(244, 63, 94, 0.1); color: var(--danger);">Ausente</span></td>
                `;
            }
            tbody.appendChild(tr);
        });

        // Unknowns
        this.model.logs.filter(l => !l.matched).forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: var(--danger); font-family: monospace;">${log.id}</td>
                <td style="font-style: italic; color: var(--danger);" colspan="2">${log.fullName}</td>
                <td>${log.date}</td>
                <td style="font-family: monospace; color: var(--danger);">${log.time}</td>
                <td><span class="status-badge" style="background: rgba(244, 63, 94, 0.2); color: var(--danger);">No Registrado</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    exportData() {
        this.exportService.exportToExcel(this.model.students, this.model.logs);
        this.showToast('✅ Reporte exportado');
    }

    showFileStatus() {
        const el = document.getElementById('file-status');
        el.style.display = 'block';
        el.innerText = `✓ ${this.model.students.length} estudiantes en base de datos local`;
        document.getElementById('btn-reset-data').style.display = 'inline-flex';
    }

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        const msgEl = document.getElementById('toast-msg');
        toast.className = `toast show ${type}`;
        msgEl.innerText = msg;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// Bootstrap the app
window.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});

// Cleanup on close
window.addEventListener('beforeunload', () => {
    if (window.app) window.app.stopScanner();
});
