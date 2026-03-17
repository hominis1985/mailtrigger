async function extractText(buffer, filename, mimeType) {
  const name = (filename || '').toLowerCase();

  try {
    if (name.endsWith('.pdf') || mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text ? data.text.slice(0, 5000) : null;
    }

    if (name.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value ? result.value.slice(0, 5000) : null;
    }

    if (name.endsWith('.xlsx') || name.endsWith('.xls') ||
        (mimeType || '').includes('spreadsheet') || (mimeType || '').includes('excel')) {
      const XLSX = require('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const rows = [];
      for (const sheetName of wb.SheetNames) {
        rows.push(XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
      }
      return rows.join('\n').slice(0, 5000) || null;
    }

    if (name.endsWith('.txt') || (mimeType || '').startsWith('text/')) {
      return buffer.toString('utf-8').slice(0, 5000);
    }

    return `[첨부파일: ${filename} (${mimeType})]`;
  } catch (e) {
    console.error(`attachments.extractText error (${filename}):`, e.message);
    return null;
  }
}

module.exports = { extractText };
