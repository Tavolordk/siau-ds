import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauPagePlaceholder } from '@shared/ui';

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [SiauPagePlaceholder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <siau-page-placeholder
      title="Solicitudes"
      subtitle="Consulta y administra las solicitudes de alta, modificación y baja de usuarios."
      icon="description"
    />
  `,
})
export class RequestsPage {}