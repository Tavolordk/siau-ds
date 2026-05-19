import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  AuditEventType,
  AuditLogRecord,
  AuditSeverity,
} from '../../../domain/models/audit-log.model';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-log-page.html',
  styleUrl: './audit-log-page.scss',
})
export class AuditLogPage {
  protected readonly searchTerm = signal<string>('');

  protected readonly logs = signal<readonly AuditLogRecord[]>([
    {
      id: 'LOG-2026-0001',
      user: 'ana.martinez',
      event: 'Inicio de sesión exitoso',
      type: 'Acceso',
      module: 'Autenticación',
      date: '15/05/2026 09:12',
      ipAddress: '192.168.1.24',
      severity: 'Informativo',
    },
    {
      id: 'LOG-2026-0002',
      user: 'carlos.ruiz',
      event: 'Registro de nuevo usuario',
      type: 'Registro',
      module: 'Gestión de Usuarios',
      date: '15/05/2026 10:35',
      ipAddress: '192.168.1.31',
      severity: 'Informativo',
    },
    {
      id: 'LOG-2026-0003',
      user: 'elena.gomez',
      event: 'Intento fallido de acceso',
      type: 'Seguridad',
      module: 'Autenticación',
      date: '15/05/2026 11:08',
      ipAddress: '192.168.1.48',
      severity: 'Advertencia',
    },
    {
      id: 'LOG-2026-0004',
      user: 'miguel.torres',
      event: 'Eliminación de perfil administrativo',
      type: 'Eliminación',
      module: 'Administración',
      date: '14/05/2026 17:42',
      ipAddress: '192.168.1.52',
      severity: 'Crítico',
    },
    {
      id: 'LOG-2026-0005',
      user: 'laura.perez',
      event: 'Actualización de catálogo de áreas',
      type: 'Actualización',
      module: 'Catálogos',
      date: '14/05/2026 15:20',
      ipAddress: '192.168.1.18',
      severity: 'Informativo',
    },
  ]);

  protected readonly filteredLogs = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();

    if (!term) {
      return this.logs();
    }

    return this.logs().filter((log) => {
      const value = `${log.id} ${log.user} ${log.event} ${log.type} ${log.module} ${log.ipAddress}`.toLowerCase();
      return value.includes(term);
    });
  });

  protected readonly accessCount = computed(() => {
    return this.logs().filter((log) => log.type === 'Acceso').length;
  });

  protected readonly securityCount = computed(() => {
    return this.logs().filter((log) => log.type === 'Seguridad').length;
  });

  protected readonly criticalCount = computed(() => {
    return this.logs().filter((log) => log.severity === 'Crítico').length;
  });

  protected readonly totalEvents = computed(() => {
    return this.logs().length;
  });

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  protected getTypeTone(type: AuditEventType): BadgeTone {
    if (type === 'Acceso') {
      return 'info';
    }

    if (type === 'Registro') {
      return 'success';
    }

    if (type === 'Actualización') {
      return 'warning';
    }

    if (type === 'Eliminación') {
      return 'danger';
    }

    return 'neutral';
  }

  protected getSeverityTone(severity: AuditSeverity): BadgeTone {
    if (severity === 'Informativo') {
      return 'success';
    }

    if (severity === 'Advertencia') {
      return 'warning';
    }

    return 'danger';
  }
}