import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type SiauFileAccept = 'documents' | 'images' | 'all';

@Component({
  selector: 'siau-file-upload',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './file-upload.html',
  styleUrl: './file-upload.scss',
})
export class SiauFileUpload {
  readonly label = input.required<string>();
  readonly placeholder = input<string>('Selecciona un archivo');
  readonly required = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly accept = input<SiauFileAccept>('all');

  readonly fileSelected = output<File | null>();

  protected readonly fileName = signal<string>('');

  protected readonly acceptValue = computed(() => {
    if (this.accept() === 'documents') {
      return '.pdf,.doc,.docx,.xls,.xlsx';
    }

    if (this.accept() === 'images') {
      return 'image/*';
    }

    return undefined;
  });

  protected handleFileChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.item(0) ?? null;

    this.fileName.set(file?.name ?? '');
    this.fileSelected.emit(file);
  }
}