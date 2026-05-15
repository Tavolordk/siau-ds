import { ChangeDetectionStrategy, Component, computed, input, output, signal, ViewChild, ElementRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Predefined accept presets for common file kinds.
 * Use `customAccept` if you need something different.
 */
export type FileUploadAccept = 'documents' | 'images' | 'pdf' | 'any';

const ACCEPT_PRESETS: Readonly<Record<FileUploadAccept, string>> = {
    documents: 'application/pdf,image/jpeg,image/png',
    images: 'image/jpeg,image/png,image/webp',
    pdf: 'application/pdf',
    any: '*/*',
};

const HUMAN_LABELS: Readonly<Record<FileUploadAccept, string>> = {
    documents: 'PDF, JPG o PNG',
    images: 'JPG, PNG o WEBP',
    pdf: 'PDF',
    any: 'cualquier formato',
};

/**
 * SIAU File Upload — single-file picker with drag & drop.
 *
 * Displays a dashed drop zone with icon + label + format hint. Once a file is
 * selected, switches to a "selected state" showing the filename, size and a
 * remove button.
 *
 * The component does NOT upload the file itself — it only manages selection.
 * The parent decides what to do with the file (upload to S3, attach to a
 * form, send via HTTP, etc).
 *
 * Validation is local: size limit and accept filter. Format/type validation
 * beyond MIME (e.g. valid PDF signature) is the parent's responsibility.
 *
 * @example
 *   <siau-file-upload
 *     label="INE"
 *     [required]="true"
 *     accept="documents"
 *     [maxSizeMb]="5"
 *     (fileSelected)="onIneSelected($event)"
 *   />
 */
@Component({
    selector: 'siau-file-upload',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './file-upload.html',
    styleUrl: './file-upload.scss',
})
export class SiauFileUpload {
    readonly label = input<string | null>(null);
    readonly required = input<boolean>(false);
    readonly disabled = input<boolean>(false);

    readonly accept = input<FileUploadAccept>('documents');
    /** Override accept with a custom MIME-type string (e.g. ".pdf,.docx"). */
    readonly customAccept = input<string | null>(null);

    /** Maximum file size in megabytes. */
    readonly maxSizeMb = input<number>(5);

    /** Custom hint text. If null, generated from accept + maxSizeMb. */
    readonly hint = input<string | null>(null);

    /** Custom placeholder shown in the empty state. */
    readonly placeholder = input<string>('Haz clic para cargar');

    readonly fileSelected = output<File>();
    readonly fileRemoved = output<void>();
    readonly fileRejected = output<string>();

    @ViewChild('fileInput') private readonly fileInputRef?: ElementRef<HTMLInputElement>;

    protected readonly selectedFile = signal<File | null>(null);
    protected readonly isDragging = signal<boolean>(false);
    protected readonly errorMessage = signal<string | null>(null);

    // ---- Computed ---------------------------------------------------------

    protected readonly acceptAttr = computed(() => {
        return this.customAccept() ?? ACCEPT_PRESETS[this.accept()];
    });

    protected readonly resolvedHint = computed(() => {
        if (this.hint()) return this.hint();
        const formats = HUMAN_LABELS[this.accept()];
        return `${formats} · Máx. ${this.maxSizeMb()} MB`;
    });

    protected readonly hasFile = computed(() => this.selectedFile() !== null);

    protected readonly fileSizeDisplay = computed(() => {
        const file = this.selectedFile();
        if (!file) return '';
        const kb = file.size / 1024;
        if (kb < 1024) return `${Math.round(kb)} KB`;
        return `${(kb / 1024).toFixed(1)} MB`;
    });

    protected readonly zoneClasses = computed(() => {
        const classes = ['siau-file-upload__zone'];
        if (this.hasFile()) classes.push('siau-file-upload__zone--filled');
        if (this.isDragging()) classes.push('siau-file-upload__zone--dragging');
        if (this.errorMessage()) classes.push('siau-file-upload__zone--error');
        if (this.disabled()) classes.push('siau-file-upload__zone--disabled');
        return classes.join(' ');
    });

    // ---- Handlers ---------------------------------------------------------

    protected onZoneClick(): void {
        if (this.disabled() || this.hasFile()) return;
        this.fileInputRef?.nativeElement.click();
    }

    protected onFileInputChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) this.processFile(file);
        // Reset native input so selecting the same file twice still triggers change
        input.value = '';
    }

    protected onDragOver(event: DragEvent): void {
        event.preventDefault();
        if (this.disabled() || this.hasFile()) return;
        this.isDragging.set(true);
    }

    protected onDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(false);
    }

    protected onDrop(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(false);
        if (this.disabled() || this.hasFile()) return;

        const file = event.dataTransfer?.files?.[0];
        if (file) this.processFile(file);
    }

    protected onRemove(event: MouseEvent): void {
        event.stopPropagation();
        this.selectedFile.set(null);
        this.errorMessage.set(null);
        this.fileRemoved.emit();
    }

    // ---- Validation -------------------------------------------------------

    private processFile(file: File): void {
        const sizeErr = this.validateSize(file);
        if (sizeErr) {
            this.errorMessage.set(sizeErr);
            this.fileRejected.emit(sizeErr);
            return;
        }

        const typeErr = this.validateType(file);
        if (typeErr) {
            this.errorMessage.set(typeErr);
            this.fileRejected.emit(typeErr);
            return;
        }

        this.errorMessage.set(null);
        this.selectedFile.set(file);
        this.fileSelected.emit(file);
    }

    private validateSize(file: File): string | null {
        const maxBytes = this.maxSizeMb() * 1024 * 1024;
        if (file.size > maxBytes) {
            return `El archivo supera el tamaño máximo de ${this.maxSizeMb()} MB`;
        }
        return null;
    }

    private validateType(file: File): string | null {
        const acceptStr = this.acceptAttr();
        if (acceptStr === '*/*') return null;

        const acceptedTypes = acceptStr.split(',').map((t) => t.trim());
        const matches = acceptedTypes.some((accepted) => {
            if (accepted.startsWith('.')) {
                return file.name.toLowerCase().endsWith(accepted.toLowerCase());
            }
            if (accepted.endsWith('/*')) {
                const prefix = accepted.replace('/*', '/');
                return file.type.startsWith(prefix);
            }
            return file.type === accepted;
        });

        if (!matches) {
            const formats = HUMAN_LABELS[this.accept()];
            return `Formato no permitido. Acepta ${formats}`;
        }
        return null;
    }
}