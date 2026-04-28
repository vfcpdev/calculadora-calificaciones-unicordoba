/**
 * Handles data export and import.
 * Responsibility: XLSX processing and File downloads.
 */
export class ExportService {
    constructor() {
        // XLSX must be loaded globally
    }

    async parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: "" });
                    
                    const students = [];
                    json.forEach((row, index) => {
                        if (index === 0) return; 
                        let idRaw = String(row.B || row.A || '').trim();
                        let nameRaw = String(row.C || '').trim();
                        if (idRaw && nameRaw) {
                            students.push({ id: idRaw, fullName: nameRaw });
                        }
                    });
                    resolve(students);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsBinaryString(file);
        });
    }

    exportToExcel(studentList, attendanceLogs) {
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

        // Add Intruders (scans not in list)
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
    }
}
