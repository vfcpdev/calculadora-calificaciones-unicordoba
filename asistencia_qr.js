// State Management
let studentList = JSON.parse(localStorage.getItem('studentList')) || [];
let attendanceLogs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
let scanner = null;

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
                
                // Heuristic search for Name
                const nameKey = keys.find(k => k.toLowerCase().includes('nombre') || k.toLowerCase().includes('completo')) || keys[0];
                const lastNameKey = keys.find(k => k.toLowerCase().includes('apellido')) || null;
                
                // Heuristic for ID: Column B is usually keys[1] depending on how XLSX parses it.
                // We'll prioritize keys[1] as it represents Column B in many Sheets.
                const idKey = keys.find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('codigo') || k.toLowerCase().includes('documento')) || keys[1] || keys[0];
                
                let firstName = row[nameKey] || 'N/A';
                let lastName = lastNameKey ? row[lastNameKey] : '';
                
                return {
                    firstName: firstName,
                    lastName: lastName,
                    fullName: `${lastName} ${firstName}`.trim(),
                    id: String(row[idKey] || 'N/A').trim()
                };
            }).filter(s => s.firstName !== 'N/A');

            localStorage.setItem('studentList', JSON.stringify(studentList));
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
    
    studentList.slice(0, 8).forEach(s => {
        const item = document.createElement('div');
        item.className = 'qr-item';
        const qrDiv = document.createElement('div');
        qrDiv.id = `qr-preview-${s.id}`;
        item.appendChild(qrDiv);
        const nameP = document.createElement('p');
        nameP.innerText = s.fullName;
        item.appendChild(nameP);
        grid.appendChild(item);

        new QRCode(qrDiv, {
            text: `${s.id}|${s.lastName}|${s.firstName}`,
            width: 100,
            height: 100,
            colorDark: "#0f172a",
            colorLight: "#ffffff"
        });
    });
}

document.getElementById('btn-generate-zip').addEventListener('click', async () => {
    if (studentList.length === 0) {
        showToast('Primero carga la lista de estudiantes', 'error');
        return;
    }

    const btn = document.getElementById('btn-generate-zip');
    btn.innerText = 'Generando...';
    btn.disabled = true;

    try {
        const zip = new JSZip();
        const tempDiv = document.getElementById('qr-hidden');

        for (const student of studentList) {
            tempDiv.innerHTML = '';
            new QRCode(tempDiv, {
                text: `${student.id}|${student.lastName}|${student.firstName}`,
                width: 500,
                height: 500
            });

            // Wait more for high-res generation
            await new Promise(r => setTimeout(r, 250));
            
            let dataUrl = '';
            const img = tempDiv.querySelector('img');
            const canvas = tempDiv.querySelector('canvas');
            
            if (img && img.src && img.src.startsWith('data:image')) {
                dataUrl = img.src;
            } else if (canvas) {
                dataUrl = canvas.toDataURL("image/png");
            }

            if (dataUrl) {
                const base64 = dataUrl.split(',')[1];
                zip.file(`${student.lastName}_${student.firstName}.png`, base64, { base64: true });
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QRs_Estudiantes.zip`;
        a.click();
        showToast('¡ZIP generado y descargado!');
    } catch (err) {
        showToast('Error al generar el ZIP', 'error');
        console.error(err);
    } finally {
        btn.innerText = 'Descargar ZIP de QRs';
        btn.disabled = false;
    }
});

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
        fps: 30,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.82);
            return { width: size, height: size };
        },
        aspectRatio: 1.0
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
    localStorage.setItem('attendanceLogs', JSON.stringify(attendanceLogs));
    
    updateAttendanceTable();
    updateStats();

    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#10b981']
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
