import { RequestRecord } from './request-record.model';

export type RequestReviewAction = 'approve' | 'reject' | 'request-correction';

export interface RequestReviewCommand {
  readonly request: RequestRecord;
  readonly action: RequestReviewAction;
  readonly comment: string;
}

export interface RequestReviewNotificationResult {
  readonly accepted: boolean;
  readonly message: string;
  readonly correoId: string | null;
}
