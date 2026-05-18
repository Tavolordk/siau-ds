import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauPagePlaceholder } from '@shared/ui';

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [SiauPagePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <siau-page-placeholder
      title="Bitácora"
      subtitle="Consulta el historial de acciones, accesos y movimientos realizados en el sistema."
      icon="timeline"
    />
  `,
})
export class AuditLogPage {}