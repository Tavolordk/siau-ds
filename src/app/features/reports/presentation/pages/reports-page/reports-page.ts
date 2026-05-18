import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauPagePlaceholder } from '@shared/ui';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [SiauPagePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <siau-page-placeholder
      title="Reportes"
      subtitle="Visualiza indicadores, métricas y reportes operativos del sistema."
      icon="insert_chart"
    />
  `,
})
export class ReportsPage {}