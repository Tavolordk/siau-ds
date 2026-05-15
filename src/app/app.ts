import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiauShell } from './shared/layout/shell/shell';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiauShell],
  template: `
    <siau-shell>
      <router-outlet />
    </siau-shell>
  `,
})
export class App { }