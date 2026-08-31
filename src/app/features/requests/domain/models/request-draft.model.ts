import {
  RequestDocument,
  RequestPriority,
  RequestType,
  RequestUserData,
} from './request-record.model';

export type RequestCreationStepId =
  | 'requester'
  | 'request'
  | 'personal-data'
  | 'assignment'
  | 'commission'
  | 'contact'
  | 'profiles'
  | 'documents'
  | 'review';

export interface RequestDraft {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeStep: RequestCreationStepId;

  /** Compatibilidad con borradores anteriores y componentes legacy. */
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

  readonly userData?: RequestUserData;
  readonly documents: readonly RequestDocument[];
}

export type RequestDraftInput = Omit<RequestDraft, 'id' | 'createdAt' | 'updatedAt'>;
