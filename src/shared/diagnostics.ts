/**
 * Diagnostic types for Problems Panel
 */

export interface DiagnosticPosition {
  line: number;
  column: number;
}

export interface DiagnosticRange {
  start: DiagnosticPosition;
  end: DiagnosticPosition;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  id: string;
  file: string;
  range: DiagnosticRange;
  severity: DiagnosticSeverity;
  message: string;
  source?: string;
  code?: string | number;
  relatedInformation?: Array<{
    file: string;
    range: DiagnosticRange;
    message: string;
  }>;
}

export interface DiagnosticsByFile {
  [filePath: string]: Diagnostic[];
}

export interface DiagnosticCounts {
  errors: number;
  warnings: number;
  info: number;
  hints: number;
  total: number;
}
