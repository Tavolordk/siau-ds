export interface ReportKpi {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly helper: string;
    readonly icon: string;
}

export interface MonthlyReportMetric {
    readonly month: string;
    readonly requests: number;
    readonly approved: number;
}

export interface ReportStatusMetric {
    readonly label: string;
    readonly value: number;
    readonly tone: 'success' | 'warning' | 'danger' | 'info';
}

export interface ReportActivity {
    readonly id: string;
    readonly event: string;
    readonly area: string;
    readonly date: string;
    readonly status: string;
}