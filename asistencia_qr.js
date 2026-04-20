// State Management (v2 labels to avoid caching old data)
let studentList = JSON.parse(localStorage.getItem('qr_attendance_v2_students')) || [];
let attendanceLogs = JSON.parse(localStorage.getItem('qr_attendance_v2_logs')) || [];
let scanner = null;
const scanSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');

// On Load
window.addEventListener('load', () => {
    updateStats();
    if (studentList.length > 0) {
        generatePrebuiltQRs();
        document.getElementById('file-status').style.display = 'block';
        document.getElementById('btn-reset-data').style.display = 'inline-flex';
        document.getElementById('file-status').innerText = `✓ ${studentList.length} estudiantes en memoria`;
    }
    updateAttendanceTable();
});

// UI Switches
function switchTab(tabId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    if (event.target && event.target.classList) event.target.classList.add('active');

    // Auto-stop scanner if leaving scanner tab
    if (tabId !== 'scanner') {
        stopScanner();
    }
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    toast.className = `toast show ${type}`;
    msgEl.innerText = msg;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Excel Processing
document.getElementById('excel-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (evt) => {
        const data = evt.target.result;
        try {
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            studentList = json.map(row => {
                const keys = Object.keys(row);
                
                // Explicit Mapping:
                // Column B (Index 1) -> ID Number
                // Column C (Index 2) -> Name
                let idRaw = String(row[keys[1]] || '').trim();
                // Extract ONLY digits for the QR code and ID matching
                const idValue = idRaw.replace(/\D/g, ''); 
                const nameValue = row[keys[2]];
                
                return {
                    firstName: String(nameValue || 'Estudiante').trim(),
                    lastName: '',
                    fullName: String(nameValue || 'Sin Nombre').trim(),
                    id: idValue || idRaw // Fallback to raw if no digits found
                };
            }).filter(s => s.id && s.fullName !== 'Sin Nombre');

            localStorage.setItem('qr_attendance_v2_students', JSON.stringify(studentList));
            updateStats();
            generatePrebuiltQRs();
            showToast(`Cargados ${studentList.length} estudiantes correctamente`);
            document.getElementById('file-status').style.display = 'block';
            document.getElementById('btn-reset-data').style.display = 'inline-flex';
            document.getElementById('file-status').innerText = `✓ ${studentList.length} estudiantes listos`;
        } catch (err) {
            showToast('Error al leer el archivo Excel', 'error');
            console.error(err);
        }
    };
    reader.readAsBinaryString(file);
});

// Reset Data Logic
document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('¿Estás seguro de que deseas borrar la lista de estudiantes y el historial?')) {
        localStorage.clear();
        studentList = [];
        attendanceLogs = [];
        showToast('Memoria limpiada correctamente', 'success');
        setTimeout(() => location.reload(), 1000);
    }
});

function updateStats() {
    document.getElementById('count-students').innerText = studentList.length;
    document.getElementById('count-present').innerText = attendanceLogs.length;
    const percent = studentList.length > 0 ? Math.round((attendanceLogs.length / studentList.length) * 100) : 0;
    document.getElementById('percent-present').innerText = `${percent}%`;
}

// QR Generation (ZIP)
function generatePrebuiltQRs() {
    const grid = document.getElementById('qr-preview-grid');
    grid.innerHTML = '';
    
    studentList.forEach(s => {
        const item = document.createElement('div');
        item.className = 'qr-item';
        
        // Label with Name and ID
        const info = document.createElement('div');
        info.innerHTML = `
            <div style="font-weight: 700; color: var(--primary); font-size: 0.9rem; margin-bottom: 0.2rem;">${s.fullName}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.8rem;">ID: ${s.id}</div>
        `;
        item.appendChild(info);

        const qrDiv = document.createElement('div');
        qrDiv.id = `qr-preview-${s.id}`;
        item.appendChild(qrDiv);
        
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.style.marginTop = '1rem';
        btn.style.width = '100%';
        btn.style.fontSize = '0.8rem';
        btn.innerHTML = `⬇️ Bajar QR`;
        
        btn.onclick = () => {
            const canvas = qrDiv.querySelector('canvas');
            if (canvas) {
                const url = canvas.toDataURL("image/png");
                const a = document.createElement('a');
                a.href = url;
                a.download = `QR_${s.id}_${s.fullName.replace(/\s+/g, '_')}.png`;
                a.click();
            }
        };

        item.appendChild(btn);
        grid.appendChild(item);

        new QRCode(qrDiv, {
            text: s.id, // Simple ID in QR to match existing folder style
            width: 150,
            height: 150,
            correctLevel: QRCode.CorrectLevel.H
        });
    });
}

// Bulk logic removed as requested for individual downloads

// Attendance Scanner
// Attendance Scanner Initialization
document.getElementById('btn-activate-camera').addEventListener('click', startScanner);

function startScanner() {
    if (scanner) return;
    
    document.getElementById('btn-activate-camera').innerText = 'Iniciando...';
    document.getElementById('camera-status').innerText = 'Solicitando permisos a la cámara...';
    
    // Show container first so library can calculate dimensions
    document.getElementById('camera-controls').style.display = 'none';
    document.getElementById('reader-container').style.display = 'block';
    document.getElementById('reader').innerHTML = '<div style="padding:2rem; color:var(--text-muted)">Iniciando visor...</div>';
    
    scanner = new Html5Qrcode("reader");
    const config = { 
        fps: 20,
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        }
    };

    scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            // Debug raw scan immediately
            document.getElementById('debug-raw').innerText = `Último detectado: ${decodedText}`;
            handleScan(decodedText);
        }
    ).then(() => {
        showToast('Cámara activada satisfactoriamente');
    }).catch(err => {
        console.error(err);
        // Fallback: Restore controls on error
        document.getElementById('camera-controls').style.display = 'block';
        document.getElementById('reader-container').style.display = 'none';
        document.getElementById('btn-activate-camera').innerText = 'Reintentar Activación';
        document.getElementById('camera-status').innerHTML = `<span style="color:var(--accent)">Error de acceso: ${err}. Verifica los permisos.</span>`;
        showToast('No se pudo acceder a la cámara', 'error');
    });
}

function stopScanner() {
    if (scanner) {
        scanner.stop().then(() => {
            scanner = null;
            document.getElementById('camera-controls').style.display = 'block';
            document.getElementById('reader-container').style.display = 'none';
            document.getElementById('btn-activate-camera').innerText = 'Activar Cámara';
            document.getElementById('camera-status').innerText = 'Cámara apagada';
        }).catch(err => console.error("Error stopping scanner", err));
    }
}

function handleScan(decodedText) {
    // Expected format: ID|Apellido|Nombre
    const parts = decodedText.split('|');
    let studentId, lastName, firstName;

    if (parts.length === 3) {
        studentId = parts[0];
        lastName = parts[1];
        firstName = parts[2];
    } else {
        // Search by ID first, then by name
        const student = studentList.find(s => 
            String(s.id).trim() === decodedText.trim() || 
            s.firstName.trim() === decodedText.trim() || 
            `${s.lastName} ${s.firstName}`.trim() === decodedText.trim()
        );

        if (student) {
            studentId = student.id;
            lastName = student.lastName;
            firstName = student.firstName;
        } else {
            studentId = 'N/A';
            lastName = '-';
            firstName = decodedText; // Keep raw text if no match
        }
    }
    
    const lastLog = attendanceLogs[0];
    if (lastLog && lastLog.id === studentId && (Date.now() - new Date(lastLog.timestampRaw).getTime() < 5000)) {
        return; 
    }

    const now = new Date();
    const logEntry = {
        id: studentId,
        lastName: lastName,
        firstName: firstName,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        timestampRaw: now.toISOString()
    };

    attendanceLogs.unshift(logEntry);
    localStorage.setItem('qr_attendance_v2_logs', JSON.stringify(attendanceLogs));
    
    // Feedbacks
    scanSound.play().catch(e => console.log("Sound error:", e));
    
    // Visual flash on reader
    const reader = document.getElementById('reader');
    reader.style.borderColor = 'var(--secondary)';
    setTimeout(() => reader.style.borderColor = 'var(--primary)', 500);

    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#10b981']
    });
    showToast(`Presente: ${firstName} ${lastName}`, 'success');
}

function updateAttendanceTable() {
    const tbody = document.querySelector('#attendance-table tbody');
    tbody.innerHTML = '';

    attendanceLogs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: var(--primary); font-family: monospace;">${log.id}</td>
            <td style="font-weight: 600;">${log.lastName}</td>
            <td>${log.firstName}</td>
            <td>${log.date}</td>
            <td style="font-family: monospace; color: var(--secondary);">${log.time}</td>
            <td><span class="status-badge">Detectado</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Export Results
document.getElementById('btn-export-attendance').addEventListener('click', () => {
    if (attendanceLogs.length === 0) {
        showToast('No hay registros para exportar', 'error');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(attendanceLogs.map(l => ({
        Estudiante: l.name,
        ID: l.id,
        Fecha: l.date,
        Hora: l.time
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asistencia");
    XLSX.writeFile(wb, "Registro_Asistencia_QR.xlsx");
    showToast('Excel exportado correctamente');
});
