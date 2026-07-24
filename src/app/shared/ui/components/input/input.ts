import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
  readonly hint = input<string | null>(null);

  readonly valueChange = output<string>();

  protected handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const readonlyPrefix = this.readonlyPrefix();

    if (this.alphanumericOnly()) {
      const maxLength = this.maxLength();
      const normalizedValue = inputElement.value
        .normalize('NFKC')
        .replace(/[^A-Za-z0-9]/g, '');

      inputElement.value =
        maxLength === null ? normalizedValue : normalizedValue.slice(0, maxLength);
      this.valueChange.emit(inputElement.value);
      return;
    }

    if (this.alphabeticOnly()) {
      const maxLength = this.maxLength();
      const normalizedValue = inputElement.value
        .normalize('NFC')
        .replace(/[^\p{L}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .replace(/^\s+/, '');

      inputElement.value =
        maxLength === null ? normalizedValue : normalizedValue.slice(0, maxLength);
      this.valueChange.emit(inputElement.value);
      return;
    }

    if (this.numericOnly()) {
      const maxLength = this.maxLength();
      const normalizedValue = inputElement.value
        .normalize('NFKC')
        .replace(/\D/g, '');

      inputElement.value =
        maxLength === null ? normalizedValue : normalizedValue.slice(0, maxLength);
      this.valueChange.emit(inputElement.value);
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
}
