import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type SiauButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type SiauButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'siau-button',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class SiauButton {
  readonly label = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly trailingIcon = input<string | null>(null);
  readonly variant = input<SiauButtonVariant>('primary');
  readonly type = input<SiauButtonType>('button');
  readonly disabled = input<boolean>(false);

  readonly clicked = output<void>();

  protected handleClick(): void {
    if (!this.disabled()) {
      this.clicked.emit();
    }
  }
}