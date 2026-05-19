import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  AdminCatalog,
  AdminModule,
  CatalogStatus,
} from '../../../domain/models/admin-catalog.model';

type BadgeTone = 'success' | 'danger';

@Component({
  selector: 'app-administration-page',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './administration-page.html',
  styleUrl: './administration-page.scss',
})
export class AdministrationPage {
  protected readonly searchTerm = signal<string>('');

  protected readonly modules = signal<readonly AdminModule[]>([
    {
      id: 'institutional-structure',
      title: 'Estructura institucional',
      description: 'Instituciones, dependencias, corporaciones y áreas.',
      icon: 'account_tree',
      totalRecords: 128,
    },
    {
      id: 'profiles',
      title: 'Perfiles y permisos',
      description: 'Roles, accesos, permisos y restricciones operativas.',
      icon: 'admin_panel_settings',
      totalRecords: 24,
    },
    {
      id: 'security',
      title: 'Configuración de seguridad',
      description: 'Parámetros de acceso, bloqueo y políticas de cuenta.',
      icon: 'shield',
      totalRecords: 16,
    },
  ]);

  protected readonly catalogs = signal<readonly AdminCatalog[]>([
    {
      id: 'cat-instituciones',
      name: 'Instituciones',
      description: 'Catálogo de instituciones registradas en el sistema.',
      records: 32,
      lastUpdate: '15/05/2026',
      status: 'Activo',
    },
    {
      id: 'cat-dependencias',
      name: 'Dependencias',
      description: 'Dependencias asociadas a instituciones.',
      records: 54,
      lastUpdate: '14/05/2026',
      status: 'Activo',
    },
    {
      id: 'cat-corporaciones',
      name: 'Corporaciones',
      description: 'Corporaciones operativas registradas.',
      records: 21,
      lastUpdate: '13/05/2026',
      status: 'Activo',
    },
    {
      id: 'cat-areas',
      name: 'Áreas',
      description: 'Áreas internas y unidades administrativas.',
      records: 128,
      lastUpdate: '10/05/2026',
      status: 'Activo',
    },
    {
      id: 'cat-perfiles',
      name: 'Perfiles',
      description: 'Perfiles de usuario disponibles para asignación.',
      records: 12,
      lastUpdate: '09/05/2026',
      status: 'Activo',
    },
    {
      id: 'cat-estatus',
      name: 'Estatus de usuario',
      description: 'Estatus permitidos para las cuentas del sistema.',
      records: 6,
      lastUpdate: '01/05/2026',
      status: 'Inactivo',
    },
  ]);

  protected readonly filteredCatalogs = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();

    if (!term) {
      return this.catalogs();
    }

    return this.catalogs().filter((catalog) => {
      const value = `${catalog.name} ${catalog.description}`.toLowerCase();
      return value.includes(term);
    });
  });

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  protected getStatusTone(status: CatalogStatus): BadgeTone {
    return status === 'Activo' ? 'success' : 'danger';
  }
}