import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SiauLucideIcon } from '../lucide-icon/lucide-icon';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'siau-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiauLucideIcon],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class SiauModal {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly icon = input<string>('info');
  readonly size = input<ModalSize>('md');
  readonly headerBadge = input<string | null>(null);

  readonly close = output<void>();

  protected readonly surfaceClasses = computed(() => {
    return `siau-modal__surface siau-modal__surface--${this.size()}`;
  });

  protected closeModal(): void {
    this.close.emit();
  }
}