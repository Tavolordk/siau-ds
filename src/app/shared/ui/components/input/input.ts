import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type SiauInputType = 'text' | 'email' | 'password' | 'tel' | 'date' | 'number' | 'search';

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
  readonly hint = input<string | null>(null);

  readonly valueChange = output<string>();

  protected handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.valueChange.emit(inputElement.value);
  }
}