import { Injectable, signal } from '@angular/core';
import {
  RequestDraft,
  RequestDraftInput,
} from '../../domain/models/request-draft.model';
import { RequestDocument } from '../../domain/models/request-record.model';

const STORAGE_KEY = 'siau.requests.drafts.v1';

@Injectable({ providedIn: 'root' })
export class RequestDraftStore {
  readonly drafts = signal<readonly RequestDraft[]>(this.read());

  save(input: RequestDraftInput, draftId?: string | null): RequestDraft {
    const now = new Date().toISOString();
    const current = this.drafts();
    const existing = draftId ? current.find((draft) => draft.id === draftId) : undefined;

    const draft: RequestDraft = {
      ...input,
      id: existing?.id ?? this.nextId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // objectUrl es temporal del navegador. El borrador persistente conserva metadata.
      documents: input.documents.map((document) => this.persistableDocument(document)),
    };

    const next = existing
      ? current.map((item) => item.id === existing.id ? draft : item)
      : [draft, ...current];

    this.commit(next);
    return draft;
  }

  remove(draftId: string): void {
    this.commit(this.drafts().filter((draft) => draft.id !== draftId));
  }

  private commit(drafts: readonly RequestDraft[]): void {
    const ordered = [...drafts].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
    this.drafts.set(ordered);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
    } catch {
      // El mock sigue funcionando en memoria si el navegador bloquea localStorage.
    }
  }

  private read(): readonly RequestDraft[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as RequestDraft[]) : [];
    } catch {
      return [];
    }
  }

  private nextId(): string {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `BOR-${Date.now()}-${suffix}`;
  }

  private persistableDocument(document: RequestDocument): RequestDocument {
    return {
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.uploadedAt,
      objectUrl: null,
    };
  }
}
