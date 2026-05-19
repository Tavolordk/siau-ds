import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  MonthlyReportMetric,
  ReportActivity,
  ReportKpi,
  ReportStatusMetric,
} from '../../../domain/models/report.model';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  protected readonly kpis = signal<readonly ReportKpi[]>([
    {
      id: 'total-users',
      label: 'Usuarios activos',
      value: '1,248',
      helper: '+8.4% vs mes anterior',
      icon: 'group',
    },
    {
      id: 'requests',
      label: 'Solicitudes generadas',
      value: '326',
      helper: 'Últimos 30 días',
      icon: 'description',
    },
    {
      id: 'approved',
      label: 'Solicitudes aprobadas',
      value: '284',
      helper: '87% de aprobación',
      icon: 'check_circle',
    },
    {
      id: 'rejected',
      label: 'Solicitudes rechazadas',
      value: '42',
      helper: '13% del total',
      icon: 'cancel',
    },
  ]);

  protected readonly monthlyMetrics = signal<readonly MonthlyReportMetric[]>([
    { month: 'Ene', requests: 180, approved: 142 },
    { month: 'Feb', requests: 214, approved: 176 },
    { month: 'Mar', requests: 248, approved: 203 },
    { month: 'Abr', requests: 292, approved: 251 },
    { month: 'May', requests: 326, approved: 284 },
  ]);

  protected readonly statusMetrics = signal<readonly ReportStatusMetric[]>([
    { label: 'Aprobadas', value: 87, tone: 'success' },
    { label: 'Pendientes', value: 8, tone: 'warning' },
    { label: 'Rechazadas', value: 5, tone: 'danger' },
  ]);

  protected readonly activities = signal<readonly ReportActivity[]>([
    {
      id: 'act-001',
      event: 'Alta masiva de usuarios',
      area: 'Administración de Usuarios',
      date: '15/05/2026',
      status: 'Completado',
    },
    {
      id: 'act-002',
      event: 'Validación de perfiles',
      area: 'Seguridad',
      date: '14/05/2026',
      status: 'En revisión',
    },
    {
      id: 'act-003',
      event: 'Actualización de catálogo',
      area: 'Estructura Institucional',
      date: '13/05/2026',
      status: 'Completado',
    },
    {
      id: 'act-004',
      event: 'Reporte de cuentas bloqueadas',
      area: 'Mesa de Control',
      date: '12/05/2026',
      status: 'Pendiente',
    },
  ]);

  protected readonly maxRequests = computed(() => {
    return Math.max(...this.monthlyMetrics().map((metric) => metric.requests));
  });

  protected getBarHeight(value: number): number {
    return Math.max((value / this.maxRequests()) * 100, 8);
  }

  protected getStatusToneClass(tone: ReportStatusMetric['tone']): string {
    return `status-item status-item--${tone}`;
  }
}