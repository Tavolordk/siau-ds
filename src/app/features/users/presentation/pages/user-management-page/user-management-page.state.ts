import { Injectable, signal } from '@angular/core';
import { BorradorItem, UserDetailRecord, UserPagination, UserRecord } from '../../../domain/models/user-record.model';
import { DEFAULT_PAGINATION, UserWizardMode } from './user-management-page.models';

/** Estado propio de la tabla, borradores y modal de usuario. */
@Injectable()
export class UserManagementPageState {
    readonly users = signal<readonly UserRecord[]>([]);
    readonly pagination = signal<UserPagination>(DEFAULT_PAGINATION);
    readonly currentPage = signal(1);
    readonly isLoading = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly informationMessage = signal<string | null>(null);

    readonly isUserWizardOpen = signal(false);
    readonly userWizardMode = signal<UserWizardMode>('create');
    readonly isNewUserMenuOpen = signal(false);
    readonly isDraftsModalOpen = signal(false);
    readonly drafts = signal<readonly BorradorItem[]>([]);
    readonly isDraftsLoading = signal(false);
    readonly draftsError = signal<string | null>(null);
    readonly draftToOpen = signal<BorradorItem | null>(null);
    readonly autoRestoreDraft = signal(false);
    readonly selectedUser = signal<UserRecord | null>(null);
    readonly selectedUserDetail = signal<UserDetailRecord | null>(null);
    readonly isDetailLoading = signal(false);
}
