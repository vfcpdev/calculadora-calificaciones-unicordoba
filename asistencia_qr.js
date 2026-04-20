// ============================
// State Management
// ============================
let studentList = JSON.parse(localStorage.getItem('qr_att_v3_students')) || [];
let attendanceLogs = JSON.parse(localStorage.getItem('qr_att_v3_logs')) || [];
let videoStream = null;
let scanInterval = null;
let lastScannedId = '';
let lastScannedTime = 0;



// ============================
// On Load
// ============================
window.addEventListener('load', () => {
    updateStats();
    if (studentList.length > 0) {
        generateStudentQRCards();
        document.getElementById('file-status').style.display = 'block';
        document.getElementById('btn-reset-data').style.display = 'inline-flex';
        document.getElementById('file-status').innerText = `✓ ${studentList.length} estudiantes en memoria`;
    }
    updateAttendanceTable();
});

// ============================
// Tab Navigation
// ============================
function switchTab(tabId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    if (event && event.target && event.target.classList) event.target.classList.add('active');

    if (tabId !== 'scanner') {
        stopScanner();
    }
}

// ============================
// Toast Notification
// ============================
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    toast.className = `toast show ${type}`;
    msgEl.innerText = msg;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================
// Excel Processing
// ============================
document.getElementById('excel-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (evt) => {
        const data = evt.target.result;
        try {
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Force strict column mapping (A, B, C...)
            // This prevents Object.keys() shifting errors if cells are empty!
            const json = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: "" });

            studentList = [];

            json.forEach((row, index) => {
                // The user explicitly stated: Row 1 (index 0) is the Header. 
                // Always skip it mechanically to prevent it treating the header as a student.
                if (index === 0) {
                    return; 
                }

                // STRICT DEFINITION:
                // Column B (row.B) = The Student ID (Number)
                // Column C (row.C) = The Student Full Name
                
                let idRaw = String(row.B || '').trim();
                let nameRaw = String(row.C || '').trim();
                
                // If the second column is empty but the first has an ID, fallback safely
                if (!idRaw && row.A) idRaw = String(row.A).trim(); 

                const idClean = idRaw.replace(/\D/g, ''); // Extract digits
                const finalId = idClean || idRaw; // Prefer digits, fallback to whatever is there
                const finalName = nameRaw || 'Estudiante Sin Nombre';

                // Ensure it's a valid row
                if (finalId !== '' && finalName !== 'Estudiante Sin Nombre') {
                    studentList.push({
                        id: finalId, // Strictly the student number
                        fullName: finalName
                    });
                }
            });

            console.log('Parsed students explicitly mapped:', studentList.slice(0, 3));

            localStorage.setItem('qr_att_v3_students', JSON.stringify(studentList));
            updateStats();
            generateStudentQRCards();
            
            // HCRITICAL FIX: Hydrate the Attendance Table Immediately!
            updateAttendanceTable(); 
            
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

// ============================
// Reset handled natively via HTML onclick attribute mapped to button
// ============================// ============================
// Stats Update
// ============================
function updateStats() {
    document.getElementById('count-students').innerText = studentList.length;
    document.getElementById('count-present').innerText = attendanceLogs.length;
    const percent = studentList.length > 0 ? Math.round((attendanceLogs.length / studentList.length) * 100) : 0;
    document.getElementById('percent-present').innerText = `${percent}%`;
}

// ============================
// QR Card Generator (Individual Downloads)
// ============================
function generateStudentQRCards() {
    const grid = document.getElementById('qr-preview-grid');
    grid.innerHTML = '';
    
    studentList.forEach((s, index) => {
        const item = document.createElement('div');
        item.className = 'qr-item';
        
        // Student info header
        const info = document.createElement('div');
        info.innerHTML = `
            <div style="font-weight:700; color:var(--primary); font-size:0.95rem; margin-bottom:0.3rem;">${s.fullName}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.8rem; font-family:monospace;">ID: ${s.id}</div>
        `;
        item.appendChild(info);

        // QR container (visually constrained by CSS max-width: 100%)
        const qrDiv = document.createElement('div');
        qrDiv.style.display = 'flex';
        qrDiv.style.justifyContent = 'center';
        qrDiv.style.alignItems = 'center';
        qrDiv.style.margin = '10px 0';
        item.appendChild(qrDiv);

        // NATIVE a tag download button
        const safeName = s.fullName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '').replace(/\s+/g, '_');
        const fileName = `QR_${s.id}_${safeName}.png`;
        
        const downloadLink = document.createElement('a');
        downloadLink.className = 'btn btn-primary';
        downloadLink.style.cssText = 'margin-top:1rem; width:100%; font-size:0.85rem; justify-content:center; cursor:pointer; text-decoration:none; text-align:center; display:flex; opacity: 0.7; pointer-events: none;';
        downloadLink.textContent = `⏳ Generando QR...`;
        downloadLink.download = fileName;
        // The href will be populated asynchronously
        downloadLink.href = '#';

        // Add feedback when eventually clicked
        downloadLink.addEventListener('click', () => {
            showToast(`✅ Iniciando descarga de ${s.fullName}`);
        });

        item.appendChild(downloadLink);
        grid.appendChild(item);

        // Generate visual QR natively at 400x400
        // CRITICAL FIX: Changed from High (H) to Low (L) correctLevel.
        // This generates massive, thick black squares instead of tiny dots, 
        // defeating webcam blur and surviving smartphone screen flare in dark rooms.
        new QRCode(qrDiv, {
            text: s.id,
            width: 400, 
            height: 400,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });

        // The absolute foolproof way to bypass Chrome's block on programmatic clicks
        // is to make the button a REAL physical link pointing to a REAL Blob URL.
        // We poll briefly until qrcode.js finishes generating the canvas.
        let checkRenderInterval = setInterval(() => {
            const canvasEl = qrDiv.querySelector('canvas');
            
            // Once the canvas is fully mounted by qrcode.js:
            if (canvasEl) {
                clearInterval(checkRenderInterval);
                
                // Export the canvas immediately to a Blob URL
                canvasEl.toBlob((blob) => {
                    const blobUrl = URL.createObjectURL(blob);
                    
                    // Attach the Blob strictly to the <a> tag
                    downloadLink.href = blobUrl;
                    
                    // Enable the button natively
                    downloadLink.style.opacity = '1';
                    downloadLink.style.pointerEvents = 'auto';
                    downloadLink.textContent = `⬇️ Descargar QR de ${s.fullName}`;
                }, 'image/png');
            }
        }, 150);

        // Fallback cleanup if generation fails for some reason
        setTimeout(() => {
            clearInterval(checkRenderInterval);
            if (downloadLink.href === '#' || downloadLink.href.endsWith('#')) {
                downloadLink.textContent = `❌ Error en QR`;
                downloadLink.style.background = 'var(--danger)';
            }
        }, 3000);
    });
}






// ============================
// QR Scanner (html5-qrcode)
// ============================
document.getElementById('btn-activate-camera').addEventListener('click', startScanner);

function startScanner() {
    if (scanner) return;
    
    document.getElementById('btn-activate-camera').innerText = 'Iniciando...';
    document.getElementById('camera-status').innerText = 'Solicitando permisos...';
    
    document.getElementById('camera-controls').style.display = 'none';
    document.getElementById('reader-container').style.display = 'block';
    
    // Clean element completely before creating a new instance
    const readerDiv = document.getElementById('reader');
    readerDiv.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted)">Iniciando lente de la cámara...</div>';
    
    // Pass formatsToSupport statically to force ONLY QR codes. 
    // This stops it from hallucinating barcodes in low-light noise!
    scanner = new Html5Qrcode("reader", { formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ] });
    
    // Safe responsive QR box size
    const screenWidth = Math.min(window.innerWidth, 500); 
    const qrboxSize = screenWidth < 400 ? 220 : 250;

    const config = { 
        fps: 10, // Slower FPS = More time per frame for the ZXing engine to process blurry dark webcams
        qrbox: { width: qrboxSize, height: qrboxSize },
        // Eliminating strict HD video constraints. In low light, forcing HD causes the webcam 
        // to drastically drop shutter speed, causing immense motion blur on the phone screen.
        // Let the browser pick its native stable resolution.
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: false // OVERRIDE: ZXing is vastly superior for blurry/glowing phone screens than native.
        }
    };

    scanner.start(
        { facingMode: "user" }, // Force internal webcam
        config,
        (decodedText) => {
            // Decoded successfully
            if (navigator.vibrate) navigator.vibrate(100);
            document.getElementById('debug-raw').innerText = `✅ ¡Código Capturado!: ${decodedText}`;
            handleScan(decodedText);
        }
    ).then(() => {
        showToast('✅ Cámara de PC activa y lista');
        document.getElementById('camera-status').innerText = '📷 Cámara activa - Muestra el QR del celular a la cámara';
        
        // Show the beautiful targeting overlay!
        document.getElementById('scanner-overlay').style.display = 'flex';
        
        if(document.activeElement) document.activeElement.blur();
    }).catch(err => {
        console.error('Camera error:', err);
        document.getElementById('camera-controls').style.display = 'block';
        document.getElementById('reader-container').style.display = 'none';
        document.getElementById('scanner-overlay').style.display = 'none';
        document.getElementById('btn-activate-camera').innerText = 'Reintentar (Cámara)';
        
        document.getElementById('camera-status').innerHTML = `<span style="color:var(--danger)">Error: No se pudo acceder a la cámara web. Otorga los permisos.</span>`;
        showToast('Acceso a cámara rechazado', 'error');
    });
}

function stopScanner() {
    if (scanner) {
        scanner.stop().then(() => {
            scanner = null;
            document.getElementById('camera-controls').style.display = 'block';
            document.getElementById('reader-container').style.display = 'none';
            document.getElementById('scanner-overlay').style.display = 'none';
            document.getElementById('btn-activate-camera').innerText = 'Activar Cámara';
            document.getElementById('camera-status').innerText = 'Cámara apagada';
        }).catch(err => console.error("Stop error:", err));
    }
}

// ============================
// Handle Scan Result
// ============================
function handleScan(decodedText) {
    // 100% exact match without aggressive stripping, just trim spaces.
    // If the QR generated '123456', decodedText will be '123456'.
    const scannedClean = String(decodedText).trim();
    
    console.log(`SCAN: raw="${decodedText}" clean="${scannedClean}"`);
    
    // Anti-bounce: ignore same ID within 5 seconds
    if (scannedClean === lastScannedId && (Date.now() - lastScannedTime) < 5000) {
        return;
    }
    
    // Find student by matching exactly
    const student = studentList.find(s => String(s.id).trim() === scannedClean);
    
    const studentId = student ? student.id : scannedClean;
    const studentName = student ? student.fullName : "Desconocido (QR Externo)";
    
    // Update anti-bounce
    lastScannedId = scannedClean;
    lastScannedTime = Date.now();
    
    // Create log entry
    const now = new Date();
    const logEntry = {
        id: studentId,
        fullName: studentName,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        timestampRaw: now.toISOString(),
        matched: !!student
    };

    attendanceLogs.unshift(logEntry);
    localStorage.setItem('qr_att_v3_logs', JSON.stringify(attendanceLogs));
    
    // Update UI
    updateAttendanceTable();
    updateStats();
    
    // Feedback: visual flash
    const reader = document.getElementById('reader');
    if (reader) {
        reader.style.borderColor = student ? '#10b981' : '#f59e0b';
        setTimeout(() => reader.style.borderColor = '#3b82f6', 600);
    }
    
    // Feedback: confetti (only for matched students)
    if (student) {
        confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
            colors: ['#3b82f6', '#10b981']
        });
        showToast(`✅ Presente: ${studentName}`, 'success');
    } else {
        showToast(`⚠️ QR leído pero no coincide con la lista`, 'error');
    }
}

// ============================
// Attendance Table
// ============================
function updateAttendanceTable() {
    const tbody = document.querySelector('#attendance-table tbody');
    tbody.innerHTML = '';

    // Render the complete roster first
    studentList.forEach(student => {
        // Search if the student has been scanned
        const record = attendanceLogs.find(log => log.id === student.id);
        
        const tr = document.createElement('tr');
        
        if (record) {
            tr.innerHTML = `
                <td style="color: var(--primary); font-family: monospace;">${student.id}</td>
                <td style="font-weight: 700;" colspan="2">${student.fullName}</td>
                <td>${record.date}</td>
                <td style="font-family: monospace; color: var(--secondary);">${record.time}</td>
                <td><span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--secondary); border: 1px solid var(--secondary);">Presente ✓</span></td>
            `;
        } else {
            tr.innerHTML = `
                <td style="color: var(--text-muted); font-family: monospace;">${student.id}</td>
                <td style="color: var(--text-muted); font-weight: 500;" colspan="2">${student.fullName}</td>
                <td style="color: var(--card-bg);">--/--/----</td>
                <td style="color: var(--card-bg);">--:--:--</td>
                <td><span class="status-badge" style="background: rgba(244, 63, 94, 0.1); color: var(--danger); opacity: 0.8;">Ausente</span></td>
            `;
        }
        
        tbody.appendChild(tr);
    });

    // Unregistered/Error Scans appended at the bottom
    const unknownScans = attendanceLogs.filter(log => !log.matched);
    unknownScans.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: var(--danger); font-family: monospace;">${log.id}</td>
            <td style="font-style: italic; color: var(--danger);" colspan="2">${log.fullName}</td>
            <td>${log.date}</td>
            <td style="font-family: monospace; color: var(--danger);">${log.time}</td>
            <td><span class="status-badge" style="background: rgba(244, 63, 94, 0.2); color: var(--danger); border: 1px solid var(--danger);">Intruso / Error QR</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================
// Export to Excel
// ============================
document.getElementById('btn-export-attendance').addEventListener('click', () => {
    if (studentList.length === 0) {
        showToast('No hay base de datos de estudiantes para exportar', 'error');
        return;
    }

    // Build the master sheet matching the new UI
    const exportData = studentList.map(student => {
        const record = attendanceLogs.find(log => log.id === student.id);
        return {
            'ID / Documento': student.id,
            'Nombre del Estudiante': student.fullName,
            'Estado Final': record ? 'PRESENTE' : 'AUSENTE',
            'Fecha Escaneo': record ? record.date : '',
            'Hora Escaneo': record ? record.time : ''
        };
    });

    // Append Intruders
    const unknownScans = attendanceLogs.filter(log => !log.matched);
    unknownScans.forEach(log => {
        exportData.push({
            'ID / Documento': log.id,
            'Nombre del Estudiante': 'DATO NO RECONOCIDO',
            'Estado Final': 'DESCONOCIDO',
            'Fecha Escaneo': log.date,
            'Hora Escaneo': log.time
        });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado_Asistencia");
    XLSX.writeFile(wb, "Reporte_General_Asistencia.xlsx");
    showToast('✅ Planilla maestra de asistencia exportada');
});
