import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'siau-page-placeholder',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-placeholder.html',
  styleUrl: './page-placeholder.scss',
})
export class SiauPagePlaceholder {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly icon = input<string>('dashboard');
}