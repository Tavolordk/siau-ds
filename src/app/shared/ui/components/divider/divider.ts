import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'siau-divider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './divider.html',
  styleUrl: './divider.scss',
})
export class SiauDivider {
  readonly label = input<string | null>(null);
}