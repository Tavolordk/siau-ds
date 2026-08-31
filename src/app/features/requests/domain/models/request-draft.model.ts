import {
  RequestDocument,
  RequestPriority,
  RequestType,
} from './request-record.model';

export type RequestCreationStepId =
  | 'requester'
  | 'request'
  | 'profiles'
  | 'documents'
  | 'review';

export interface RequestDraft {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeStep: RequestCreationStepId;
  readonly type: RequestType;
  readonly applicant: string;
  readonly username: string;
  readonly email: string;
  readonly curp: string;
  readonly institution: string;
  readonly department: string;
  readonly priority: RequestPriority;
  readonly profiles: string;
  readonly comments: string;
  readonly documents: readonly RequestDocument[];
}

export type RequestDraftInput = Omit<RequestDraft, 'id' | 'createdAt' | 'updatedAt'>;
