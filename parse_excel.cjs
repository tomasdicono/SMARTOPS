const xlsx = require('xlsx');
try {
    const workbook = xlsx.readFile('C:\\Users\\TomasDicono\\Desktop\\SMARTOPS - Nuevo\\Matriculas.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(JSON.stringify(data.filter(row => row.length > 0).slice(0, 100), null, 2));
} catch (e) {
    console.error("ERROR", e);
}
