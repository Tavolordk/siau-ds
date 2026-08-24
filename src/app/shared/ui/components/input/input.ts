import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  clampDateInput,
  sanitizeContactEmailInput,
  sanitizeRestrictedText,
} from '../../../validation/field-validators';

export type SiauInputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'date'
  | 'number'
  | 'search';

@Component({
  selector: 'siau-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './input.html',
  styleUrl: './input.scss',
})
export class SiauInput {
  readonly label = input.required<string>();
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly type = input<SiauInputType>('text');
  readonly required = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly maxLength = input<number | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly readonlyPrefix = input<string>('');
  readonly alphanumericOnly = input<boolean>(false);
  readonly alphabeticOnly = input<boolean>(false);
  readonly numericOnly = input<boolean>(false);
  readonly employeeNumberOnly = input<boolean>(false);
  readonly safeTextOnly = input<boolean>(false);
  readonly emailOnly = input<boolean>(false);
  /**
   * Al salir del campo ajusta el valor al rango [min]/[max]. El input nativo
   * de tipo date sólo respeta el rango en el calendario, no al teclear.
   */
  readonly clampOnBlur = input<boolean>(false);
  readonly hint = input<string | null>(null);
  /** Mensaje de error del campo. Cuando llega, sustituye a la pista. */
  readonly error = input<string | null>(null);

  readonly valueChange = output<string>();

  protected handleBlur(event: Event): void {
    if (!this.clampOnBlur() || this.type() !== 'date') {
      return;
    }

    const inputElement = event.target as HTMLInputElement;
    const clampedValue = clampDateInput(
      inputElement.value,
      this.min() ?? '',
      this.max() ?? '',
    );

    if (clampedValue !== inputElement.value) {
      inputElement.value = clampedValue;
      this.valueChange.emit(clampedValue);
    }
  }

  protected handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const readonlyPrefix = this.readonlyPrefix();

    if (this.alphanumericOnly()) {
      const maxLength = this.maxLength();
      const normalize = (value: string): string => {
        const normalizedValue = value
          .normalize('NFKC')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');

        return maxLength === null
          ? normalizedValue
          : normalizedValue.slice(0, maxLength);
      };

      this.emitNormalizedValueKeepingSelection(inputElement, normalize);
      return;
    }

    if (this.alphabeticOnly()) {
      const maxLength = this.maxLength();
      const normalize = (value: string): string => {
        const normalizedValue = value
          .normalize('NFKC')
          .toUpperCase()
          .replace(/[^A-Z\s]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/^\s+/, '');

        return maxLength === null
          ? normalizedValue
          : normalizedValue.slice(0, maxLength);
      };

      this.emitNormalizedValueKeepingSelection(inputElement, normalize);
      return;
    }

    if (this.numericOnly()) {
      const maxLength = this.maxLength();
      const normalize = (value: string): string => {
        const normalizedValue = value
          .normalize('NFKC')
          .replace(/\D/g, '');

        return maxLength === null
          ? normalizedValue
          : normalizedValue.slice(0, maxLength);
      };

      this.emitNormalizedValueKeepingSelection(inputElement, normalize);
      return;
    }

    if (this.employeeNumberOnly()) {
      const maxLength = this.maxLength();
      const normalize = (value: string): string => {
        const normalizedValue = value
          .normalize('NFKC')
          .toUpperCase()
          .replace(/[^A-Z0-9 -]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/^\s+/, '');

        return maxLength === null
          ? normalizedValue
          : normalizedValue.slice(0, maxLength);
      };

      this.emitNormalizedValueKeepingSelection(inputElement, normalize);
      return;
    }

    if (this.emailOnly()) {
      const maxLength = this.maxLength();
      const normalize = (value: string): string => {
        const normalizedValue = sanitizeContactEmailInput(value);

        return maxLength === null
          ? normalizedValue
          : normalizedValue.slice(0, maxLength);
      };

      this.emitNormalizedValueKeepingSelection(inputElement, normalize);
      return;
    }

    if (this.safeTextOnly()) {
      const maxLength = this.maxLength();
      // Catálogo VC07/VC08, centralizado en shared/validation.
      const normalize = (value: string): string =>
        sanitizeRestrictedText(value, maxLength ?? value.length, true);

      this.emitNormalizedValueKeepingSelection(inputElement, normalize);
      return;
    }

    if (!readonlyPrefix) {
      this.valueChange.emit(inputElement.value);
      return;
    }

    const rawValue = inputElement.value.toUpperCase();
    const maxLength = this.maxLength();
    const maxSuffixLength =
      maxLength === null
        ? Math.max(0, rawValue.length - readonlyPrefix.length)
        : Math.max(0, maxLength - readonlyPrefix.length);

    const rawSuffix = rawValue.startsWith(readonlyPrefix)
      ? rawValue.slice(readonlyPrefix.length)
      : rawValue.slice(-maxSuffixLength);

    const normalizedValue = `${readonlyPrefix}${rawSuffix.slice(0, maxSuffixLength)}`;

    inputElement.value = normalizedValue;
    this.valueChange.emit(normalizedValue);
  }

  private emitNormalizedValueKeepingSelection(
    inputElement: HTMLInputElement,
    normalize: (value: string) => string,
  ): void {
    const rawValue = inputElement.value;
    const rawSelectionStart = inputElement.selectionStart ?? rawValue.length;
    const rawSelectionEnd = inputElement.selectionEnd ?? rawSelectionStart;
    const normalizedValue = normalize(rawValue);
    const normalizedSelectionStart = Math.min(
      normalize(rawValue.slice(0, rawSelectionStart)).length,
      normalizedValue.length,
    );
    const normalizedSelectionEnd = Math.min(
      normalize(rawValue.slice(0, rawSelectionEnd)).length,
      normalizedValue.length,
    );

    inputElement.value = normalizedValue;
    this.restoreSelection(
      inputElement,
      normalizedSelectionStart,
      normalizedSelectionEnd,
    );
    this.valueChange.emit(normalizedValue);

    // El binding [value] del componente padre puede volver a escribir el valor
    // durante la detección de cambios. Se restaura al terminar el evento y otra
    // vez después del siguiente render para evitar que Angular mande el cursor
    // al final al editar un carácter en medio del valor.
    queueMicrotask(() => {
      this.restoreSelection(
        inputElement,
        normalizedSelectionStart,
        normalizedSelectionEnd,
      );
    });

    requestAnimationFrame(() => {
      this.restoreSelection(
        inputElement,
        normalizedSelectionStart,
        normalizedSelectionEnd,
      );
    });
  }

  private restoreSelection(
    inputElement: HTMLInputElement,
    selectionStart: number,
    selectionEnd: number,
  ): void {
    if (typeof inputElement.setSelectionRange !== 'function') {
      return;
    }

    try {
      inputElement.setSelectionRange(selectionStart, selectionEnd);
    } catch {
      // Algunos tipos nativos, como date o number, no permiten seleccionar texto.
    }
  }

}
