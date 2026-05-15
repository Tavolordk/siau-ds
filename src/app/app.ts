import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauShell } from './shared/layout/shell/shell';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiauShell],
  template: `
    <siau-shell>
      <div style="padding: 2rem; background: white; border-radius: 12px; min-height: 60vh;">
        <h2 style="margin: 0 0 0.5rem; color: #1a2350;">Área de contenido</h2>
        <p style="color: #6b7280;">
          Aquí irá la pantalla de Gestión de Usuarios (pantalla 004). Por ahora solo vemos el shell.
        </p>
        <p style="color: #6b7280;">
          Prueba: haz clic en "Colapsar" para ver el sidebar contraerse. Haz clic en items del menú para
          ver el estado activo cambiar.
        </p>
      </div>
    </siau-shell>
  `,
})
export class App { }