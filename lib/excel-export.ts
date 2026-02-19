import * as XLSX from 'xlsx';

interface ExportToExcelOptions<T> {
  data: T[];
  fileName: string;
  sheetName?: string;
  headers?: string[];
}

/**
 * Exports an array of data to an Excel file.
 *
 * IMPORTANT: Due to known vulnerabilities in the 'xlsx' package, ensure that:
 * 1. All input data is thoroughly validated and sanitized before being passed to this function.
 * 2. Only trusted data sources are used for Excel exports.
 * 3. The data does not contain any executable content or scripts.
 *
 * This function serves as a placeholder. Comprehensive input validation and sanitization
 * should be implemented upstream before calling this export utility.
 *
 * @param options - Configuration for the Excel export.
 * @param options.data - The array of objects to export. Each object represents a row.
 * @param options.fileName - The name of the output Excel file (e.g., 'report.xlsx').
 * @param options.sheetName - The name of the sheet within the Excel file (defaults to 'Sheet1').
 * @param options.headers - Optional array of headers to use for the columns. If not provided,
 *                          object keys from the first data item will be used.
 */
export function exportToExcel<T extends Record<string, any>>(
  options: ExportToExcelOptions<T>
): void {
  const { data, fileName, sheetName = 'Sheet1', headers } = options;

  if (!data || data.length === 0) {
    console.warn('No data provided for Excel export.');
    return;
  }

  // Basic data preparation. Upstream validation/sanitization is critical.
  const wsData = headers
    ? [headers, ...data.map((item) => headers.map((header) => item[header]))]
    : data;

  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Attempt to write the file. In a real application, this might be triggered
  // by a user action and involve a file download.
  XLSX.writeFile(wb, fileName);
}
