import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  RequestDocument,
  RequestDocumentMimeType,
  RequestRecord,
} from '../../../domain/models/request-record.model';
import {
  RequestReviewAction,
  RequestReviewCommand,
} from '../../../domain/models/request-review.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES: readonly RequestDocumentMimeType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

@Component({
  selector: 'app-request-workspace',
  standalone: true,
  imports: [FormsModule, SiauLucideIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-workspace.html',
  styleUrl: './request-workspace.scss',
})
export class RequestWorkspace {
  private readonly sanitizer = inject(DomSanitizer);

  readonly request = input<RequestRecord | null>(null);
  readonly embedded = input(false);
  readonly busy = input(false);
  readonly resultMessage = input<string | null>(null);
  readonly resultTone = input<'success' | 'error' | null>(null);

  readonly actionRequested = output<RequestReviewCommand>();
  readonly documentsChanged = output<readonly RequestDocument[]>();

  protected readonly documents = signal<readonly RequestDocument[]>([]);
  protected readonly selectedDocumentId = signal<string | null>(null);
  protected readonly selectedAction = signal<RequestReviewAction | null>(null);
  protected readonly comment = signal('');
  protected readonly uploadError = signal<string | null>(null);

  protected readonly selectedDocument = computed(() => {
    const id = this.selectedDocumentId();
    return this.documents().find((document) => document.id === id) ?? null;
  });

  protected readonly previewSafeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.selectedDocument()?.objectUrl;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  protected readonly totalSize = computed(() =>
    this.documents().reduce((total, document) => total + document.sizeBytes, 0),
  );

  protected readonly commentValid = computed(() => {
    const length = this.comment().trim().length;
    return length >= 5 && length <= 1000;
  });

  protected readonly canSubmit = computed(
    () => Boolean(this.request() && this.selectedAction() && this.commentValid() && !this.busy()),
  );

  constructor() {
    effect(() => {
      const current = this.request();
      const docs = current?.documents ?? [];
      this.documents.set(docs);
      this.selectedDocumentId.set(docs[0]?.id ?? null);
      this.selectedAction.set(null);
      this.comment.set('');
      this.uploadError.set(null);
    });
  }

  protected selectAction(action: RequestReviewAction): void {
    this.selectedAction.set(action);
  }

  protected updateComment(value: string): void {
    this.comment.set(value.slice(0, 1000));
  }

  protected selectDocument(id: string): void {
    this.selectedDocumentId.set(id);
  }

  protected handleFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (!files.length) return;

    const invalidType = files.find((file) => !ACCEPTED_TYPES.includes(file.type as RequestDocumentMimeType));
    if (invalidType) {
      this.uploadError.set(`“${invalidType.name}” no es PDF, JPG o PNG.`);
      return;
    }

    const oversized = files.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      this.uploadError.set(`“${oversized.name}” supera el máximo de 10 MB.`);
      return;
    }

    const uploadedAt = new Date().toLocaleString('es-MX');
    const additions = files.map<RequestDocument>((file) => ({
      id: this.newId(),
      name: file.name,
      mimeType: file.type as RequestDocumentMimeType,
      sizeBytes: file.size,
      uploadedAt,
      objectUrl: URL.createObjectURL(file),
    }));

    this.documents.update((current) => [...current, ...additions]);
    this.selectedDocumentId.set(additions[0].id);
    this.uploadError.set(null);
    this.documentsChanged.emit(this.documents());
  }

  protected removeDocument(document: RequestDocument, event: Event): void {
    event.stopPropagation();
    if (document.objectUrl) URL.revokeObjectURL(document.objectUrl);

    this.documents.update((current) => current.filter((item) => item.id !== document.id));
    if (this.selectedDocumentId() === document.id) {
      this.selectedDocumentId.set(this.documents()[0]?.id ?? null);
    }
    this.documentsChanged.emit(this.documents());
  }

  protected downloadDocument(document: RequestDocument, event: Event): void {
    event.stopPropagation();
    if (!document.objectUrl) return;

    const anchor = window.document.createElement('a');
    anchor.href = document.objectUrl;
    anchor.download = document.name;
    anchor.click();
  }

  protected submitAction(): void {
    const request = this.request();
    const action = this.selectedAction();
    const comment = this.comment().trim();

    if (!request || !action || comment.length < 5 || comment.length > 1000 || this.busy()) return;

    this.actionRequested.emit({ request, action, comment });
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected fileLabel(document: RequestDocument): string {
    if (document.mimeType === 'application/pdf') return 'PDF';
    if (document.mimeType === 'image/png') return 'PNG';
    return 'JPG';
  }

  protected actionTitle(action: RequestReviewAction | null): string {
    if (action === 'approve') return 'Aprobar';
    if (action === 'reject') return 'Rechazar';
    if (action === 'request-correction') return 'Solicitar corrección';
    return 'Selecciona una acción';
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
