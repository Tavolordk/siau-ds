import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauPagePlaceholder } from '@shared/ui';

@Component({
  selector: 'app-modals-page',
  standalone: true,
  imports: [SiauPagePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <siau-page-placeholder
      title="Modals"
      subtitle="Biblioteca visual de modales, diálogos y componentes emergentes del sistema."
      icon="layers"
    />
  `,
})
export class ModalsPage {}