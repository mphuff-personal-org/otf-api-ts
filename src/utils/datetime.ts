/**
 * Centralized datetime formatting utilities to ensure 100% Python parity
 * 
 * Python uses two main datetime formats:
 * 1. WITH TIMEZONE: 2025-07-29T12:00:26+00:00 (ISO with +00:00 format)
 * 2. WITHOUT TIMEZONE: 2024-11-16T07:13:35 (local format, no timezone)
 */

/**
 * Formats date to match Python's ISO format exactly
 * Python: "2025-07-29T12:00:00+00:00" 
 * JavaScript default: "2025-07-29T12:00:00.000Z"
 * 
 * Use for: class_start_time, starts_at_utc, timestamp, created_at, updated_at
 */
export function formatDateToPythonISO(date: Date): string {
  // Get ISO string and convert Z format to +00:00 format
  // Remove milliseconds (.000) and replace Z with +00:00
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/**
 * Formats date to Python's local format (no timezone)
 * Python: "2024-11-16T07:13:35"
 * 
 * Use for: scan_datetime, starts_at (local), open_date, end, start
 */
export function formatDateToLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Auto-detects and formats date based on field name to match Python patterns
 * 
 * @param date Date object to format
 * @param fieldName Field name to determine format (e.g., 'scan_datetime', 'class_start_time')
 * @returns Formatted date string matching Python format
 */
export function formatDateForPythonParity(date: Date, fieldName: string): string {
  // Fields that use local format (no timezone)
  const localFormatFields = [
    'scan_datetime',
    'starts_at', // local class start time
    'open_date',
    're_open_date',
    'end',
    'start'
  ];
  
  if (localFormatFields.includes(fieldName)) {
    return formatDateToLocal(date);
  }
  
  // Default to ISO format with +00:00 timezone for all other datetime fields
  return formatDateToPythonISO(date);
}

/**
 * Safely parses date string/object and formats for Python parity
 * 
 * @param dateValue Date string, Date object, or null/undefined
 * @param fieldName Field name for format detection
 * @returns Formatted date string or null
 */
export function safeDateFormat(dateValue: string | Date | null | undefined, fieldName: string): string | null {
  if (!dateValue) return null;
  
  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return formatDateForPythonParity(date, fieldName);
  } catch (error) {
    console.warn(`Failed to format date for field ${fieldName}:`, error);
    return null;
  }
}

/**
 * Legacy function maintained for backward compatibility
 * @deprecated Use formatDateToPythonISO instead
 */
export function formatDateTimeToLocal(date: Date): string {
  return formatDateToLocal(date);
}