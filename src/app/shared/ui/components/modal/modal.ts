import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type SiauModalSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'siau-modal',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class SiauModal {
  readonly open = input<boolean>(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly size = input<SiauModalSize>('md');
  readonly headerBadge = input<string | null>(null);

  readonly close = output<void>();

  protected closeModal(): void {
    this.close.emit();
  }

  protected stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }
}