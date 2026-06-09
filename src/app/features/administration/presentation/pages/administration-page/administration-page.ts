import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';

interface SystemMetric {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
  readonly tone: 'success' | 'primary' | 'info' | 'warning';
}

interface AdminSystemCard {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly iconTone: 'primary' | 'info' | 'danger' | 'gold' | 'warning';
  readonly status: 'Activo' | 'En revisión';
  readonly statusIcon: 'circle-check' | 'clock';
  readonly configurations: number;
  readonly updatedAt: string;
}

@Component({
  selector: 'app-administration-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiauLucideIcon],
  templateUrl: './administration-page.html',
  styleUrl: './administration-page.scss',
})
export class AdministrationPage {
  protected readonly metrics = signal<readonly SystemMetric[]>([
    {
      value: '6',
      label: 'Módulos activos',
      hint: 'de 6 configurados',
      tone: 'success',
    },
    {
      value: '4',
      label: 'Roles definidos',
      hint: 'tipos de usuario',
      tone: 'primary',
    },
    {
      value: '8',
      label: 'Catálogos',
      hint: 'listas de referencia',
      tone: 'info',
    },
    {
      value: 'Hoy',
      label: 'Última actualización',
      hint: '09:45 hrs',
      tone: 'warning',
    },
  ]);

  protected readonly cards = signal<readonly AdminSystemCard[]>([
    {
      id: 'roles-permisos',
      category: 'Seguridad',
      title: 'Roles y Permisos',
      description: 'Gestión de perfiles de acceso, privilegios y restricciones por tipo de usuario.',
      icon: 'shield',
      iconTone: 'primary',
      status: 'Activo',
      statusIcon: 'circle-check',
      configurations: 12,
      updatedAt: 'Hoy, 09:45',
    },
    {
      id: 'catalogos',
      category: 'Datos',
      title: 'Catálogos',
      description: 'Administración de catálogos institucionales, listas de valores y tablas de referencia.',
      icon: 'database',
      iconTone: 'info',
      status: 'Activo',
      statusIcon: 'circle-check',
      configurations: 8,
      updatedAt: 'Hace 2 días',
    },
    {
      id: 'configuracion-general',
      category: 'Sistema',
      title: 'Configuración General',
      description: 'Parámetros globales del sistema, comportamiento institucional y preferencias de operación.',
      icon: 'sliders-horizontal',
      iconTone: 'primary',
      status: 'Activo',
      statusIcon: 'circle-check',
      configurations: 24,
      updatedAt: 'Hace 5 días',
    },
    {
      id: 'seguridad',
      category: 'Acceso',
      title: 'Seguridad',
      description: 'Políticas de contraseñas, gestión de sesiones activas, 2FA y auditoría de acceso.',
      icon: 'lock',
      iconTone: 'danger',
      status: 'Activo',
      statusIcon: 'circle-check',
      configurations: 6,
      updatedAt: 'Ayer, 14:20',
    },
    {
      id: 'notificaciones',
      category: 'Comunicaciones',
      title: 'Notificaciones',
      description: 'Configuración de alertas automáticas, plantillas de correo y canales de notificación.',
      icon: 'bell',
      iconTone: 'gold',
      status: 'Activo',
      statusIcon: 'circle-check',
      configurations: 15,
      updatedAt: 'Hace 3 días',
    },
    {
      id: 'parametros',
      category: 'Infraestructura',
      title: 'Parámetros del Sistema',
      description: 'Variables de entorno, integraciones externas y configuración técnica avanzada del sistema.',
      icon: 'server',
      iconTone: 'warning',
      status: 'En revisión',
      statusIcon: 'clock',
      configurations: 32,
      updatedAt: 'Hace 7 días',
    },
  ]);
}