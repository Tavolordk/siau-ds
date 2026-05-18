import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SiauSelectOption {
  readonly value: string;
  readonly label: string;
}

@Component({
  selector: 'siau-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './select.html',
  styleUrl: './select.scss',
})
export class SiauSelect {
  readonly label = input.required<string>();
  readonly options = input<readonly SiauSelectOption[]>([]);
  readonly value = input<string>('');
  readonly placeholder = input<string>('Selecciona una opción');
  readonly required = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly hint = input<string | null>(null);

  readonly valueChange = output<string>();

  protected handleChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.valueChange.emit(selectElement.value);
  }
}

export type { SiauSelectOption as SiauOption };