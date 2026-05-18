import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauPagePlaceholder } from '@shared/ui';

@Component({
  selector: 'app-administration-page',
  standalone: true,
  imports: [SiauPagePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <siau-page-placeholder
      title="Administración"
      subtitle="Administra catálogos, estructuras institucionales y configuraciones del sistema."
      icon="tune"
    />
  `,
})
export class AdministrationPage {}