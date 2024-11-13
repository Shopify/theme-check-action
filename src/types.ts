export interface ThemeCheckOffense {
  check: string;
  severity: 'error' | 'warning' | 'info';
  start_row: number;
  start_column: number;
  end_row: number;
  end_column: number;
  message: string;
}

export interface ThemeCheckReport {
  path: string;
  offenses: ThemeCheckOffense[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}
