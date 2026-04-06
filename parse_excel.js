import * as xlsx from 'xlsx';
import * as fs from 'fs';

xlsx.set_fs(fs);

try {
    const workbook = xlsx.readFile('C:\\Users\\TomasDicono\\Desktop\\SMARTOPS - Nuevo\\Matriculas.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(JSON.stringify(data.slice(0, 100), null, 2));
} catch (e) {
    console.error("ERROR", e);
}
