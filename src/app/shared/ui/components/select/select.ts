import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

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
  readonly error = input<string | null>(null);

  readonly valueChange = output<string>();

  /**
   * El <select> nativo pierde la selección visual cuando el @for re-crea las
   * <option> (cargas asíncronas de catálogo). Se re-aplica vía [selected] en
   * cada opción; si el valor actual ya no existe en las opciones, se vuelve
   * a mostrar el placeholder en lugar de "brincar" a otra opción.
   */
  protected readonly hasSelectedOption = computed(() => {
    const current = this.value();

    return !!current && this.options().some((option) => option.value === current);
  });

  protected handleChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.valueChange.emit(selectElement.value);
  }
}

export type { SiauSelectOption as SiauOption };