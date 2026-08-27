import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthStorage } from '../../../../../../core/auth/data-access/auth.storage';
import {
    RESTRICTED_TEXT_LIMITS,
    getRestrictedTextError,
    sanitizeRestrictedText,
} from '../../../../../../shared/validation/field-validators';
import { UsersFacade } from '../../../../application/users.facade';
import {
    SolicitudOperacionRequest,
    SolicitudOperacionResponse,
    UserRecord,
} from '../../../../domain/models/user-record.model';
import {
    AccountOperationKind,
    AccountOperationSuccessState,
} from '../models/user-management-page.models';

@Injectable()
export class UserAccountOperationsController {
    private readonly usersFacade = inject(UsersFacade);
    private readonly authStorage = inject(AuthStorage);

    readonly isBajaModalOpen = signal<boolean>(false);
    readonly bajaTargetUser = signal<UserRecord | null>(null);
    readonly bajaComment = signal<string>('');
    readonly bajaCommentError = signal<string | null>(null);
    readonly isBajaSubmitting = signal<boolean>(false);

    readonly isStatusModalOpen = signal<boolean>(false);
    readonly statusTargetUser = signal<UserRecord | null>(null);
    readonly statusComment = signal<string>('');
    readonly statusCommentError = signal<string | null>(null);
    readonly isStatusSubmitting = signal<boolean>(false);

    readonly operationSuccess = signal<AccountOperationSuccessState | null>(null);

    readonly isAdminUser = computed(() => {
        const sessionUser = this.authStorage.session()?.user;
        const role = this.normalizeForCompare(sessionUser?.role ?? '');
        const profiles = sessionUser?.profiles ?? [];

        return role.includes('admin')
            || profiles.some((profile) => this.normalizeForCompare(profile).includes('admin'));
    });

    openBajaModal(
        user: UserRecord,
        errorMessage: WritableSignal<string | null>,
        informationMessage: WritableSignal<string | null>,
    ): void {
        if (this.isCurrentSessionUser(user)) {
            errorMessage.set('No puedes dar de baja la cuenta con la que tienes la sesión activa.');
            return;
        }

        this.bajaTargetUser.set(user);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
        errorMessage.set(null);
        informationMessage.set(null);
        this.isBajaModalOpen.set(true);

        if (this.isUserBaja(user)) {
            this.bajaCommentError.set('El usuario ya está dado de baja.');
            return;
        }

        if (!this.resolveTargetUserId(user)) {
            this.bajaCommentError.set('No se encontró el identificador interno del usuario. Revisa el mapeo de usuarioId.');
        }
    }

    closeBajaModal(): void {
        if (this.isBajaSubmitting()) {
            return;
        }

        this.isBajaModalOpen.set(false);
        this.bajaTargetUser.set(null);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
    }

    updateBajaComment(value: string): void {
        const normalizedValue = this.normalizeOperationCommentInput(value);

        this.bajaComment.set(normalizedValue);

        if (normalizedValue.trim()) {
            this.bajaCommentError.set(null);
        }
    }

    confirmDarDeBajaUsuario(
        errorMessage: WritableSignal<string | null>,
        onSuccess: () => void,
    ): void {
        const user = this.bajaTargetUser();
        const userId = this.resolveTargetUserId(user);

        if (!user || !userId) {
            this.bajaCommentError.set('No se puede dar de baja porque el usuario no tiene identificador interno.');
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            this.bajaCommentError.set('No puedes dar de baja la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user)) {
            this.bajaCommentError.set('El usuario ya está dado de baja.');
            return;
        }

        const comentarioNormalizado = this.bajaComment().trim().toUpperCase();
        const commentError = this.validateOperationComment(comentarioNormalizado);

        if (commentError) {
            this.bajaCommentError.set(commentError);
            return;
        }

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-baja-${Date.now()}`,
            },
        };

        this.isBajaSubmitting.set(true);
        errorMessage.set(null);
        this.bajaCommentError.set(null);

        this.usersFacade
            .darDeBajaUsuario(request)
            .pipe(finalize(() => this.isBajaSubmitting.set(false)))
            .subscribe({
                next: (response) => {
                    this.isBajaSubmitting.set(false);
                    this.isBajaModalOpen.set(false);
                    this.bajaTargetUser.set(null);
                    this.bajaComment.set('');
                    this.bajaCommentError.set(null);
                    this.showOperationSuccess('baja', user, response, onSuccess);
                },
                error: (error: unknown) => {
                    this.bajaCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    openStatusModal(
        user: UserRecord,
        errorMessage: WritableSignal<string | null>,
        informationMessage: WritableSignal<string | null>,
    ): void {
        if (this.isCurrentSessionUser(user)) {
            errorMessage.set('Solo puedes consultar el detalle de la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user) || this.isUserBlocked(user)) {
            errorMessage.set(
                this.isUserBlocked(user)
                    ? 'Utiliza la acción de desbloqueo para esta cuenta.'
                    : 'La cuenta dada de baja no es reactivable.',
            );
            return;
        }

        this.prepareStatusModal(user, errorMessage, informationMessage);
    }

    openUnlockModal(
        user: UserRecord,
        errorMessage: WritableSignal<string | null>,
        informationMessage: WritableSignal<string | null>,
    ): void {
        if (!this.isUserBlocked(user)) {
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            errorMessage.set('No puedes desbloquear la cuenta con la que tienes la sesión activa.');
            return;
        }

        this.prepareStatusModal(user, errorMessage, informationMessage);
    }

    closeStatusModal(): void {
        if (this.isStatusSubmitting()) {
            return;
        }

        this.isStatusModalOpen.set(false);
        this.statusTargetUser.set(null);
        this.statusComment.set('');
        this.statusCommentError.set(null);
    }

    updateStatusComment(value: string): void {
        const normalizedValue = this.normalizeOperationCommentInput(value);

        this.statusComment.set(normalizedValue);

        if (normalizedValue.trim()) {
            this.statusCommentError.set(null);
        }
    }

    confirmToggleUserStatus(
        errorMessage: WritableSignal<string | null>,
        onSuccess: () => void,
    ): void {
        const user = this.statusTargetUser();
        const userId = this.resolveTargetUserId(user);

        if (!user || !userId) {
            this.statusCommentError.set('No se puede procesar la operación porque el usuario no tiene identificador interno.');
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            this.statusCommentError.set('No puedes cambiar el estatus de la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user)) {
            this.statusCommentError.set('La cuenta dada de baja no es reactivable.');
            return;
        }

        const isUnlockOperation = this.isUserBlocked(user);
        const comentarioNormalizado = isUnlockOperation
            ? 'DESBLOQUEO DE CUENTA'
            : this.statusComment().trim().toUpperCase();
        const commentError = isUnlockOperation
            ? null
            : this.validateOperationComment(comentarioNormalizado);

        if (commentError) {
            this.statusCommentError.set(commentError);
            return;
        }

        const operationName: AccountOperationKind = isUnlockOperation
            ? 'desbloqueo'
            : this.isUserSuspended(user)
                ? 'reactivacion'
                : 'suspension';

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-${operationName}-${Date.now()}`,
            },
        };

        const operation$ = this.isUserBlocked(user)
            ? this.usersFacade.desbloquearUsuario(request)
            : this.isUserSuspended(user)
                ? this.usersFacade.reactivarUsuario(request)
                : this.usersFacade.suspenderUsuario(request);

        this.isStatusSubmitting.set(true);
        errorMessage.set(null);
        this.statusCommentError.set(null);

        operation$
            .pipe(finalize(() => this.isStatusSubmitting.set(false)))
            .subscribe({
                next: (response) => {
                    this.isStatusSubmitting.set(false);
                    this.isStatusModalOpen.set(false);
                    this.statusTargetUser.set(null);
                    this.statusComment.set('');
                    this.statusCommentError.set(null);
                    this.showOperationSuccess(operationName, user, response, onSuccess);
                },
                error: (error: unknown) => {
                    this.statusCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    closeOperationSuccessModal(): void {
        if (!this.operationSuccess()) {
            return;
        }

        this.operationSuccess.set(null);
    }

    getToggleTitle(user: UserRecord): string {
        return this.isUserSuspended(user) ? 'Reactivar' : 'Suspender';
    }

    getToggleIcon(user: UserRecord): string {
        return this.isUserSuspended(user) ? 'check' : 'ban';
    }

    getToggleActionClass(user: UserRecord): string {
        return this.isUserSuspended(user)
            ? 'users-table__action users-table__action--activate'
            : 'users-table__action users-table__action--ban';
    }

    getStatusModalTitle(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Desbloquear usuario';
        }

        return user && this.isUserSuspended(user) ? 'Reactivar usuario' : 'Suspender usuario';
    }

    getStatusModalSubtitle(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Esta acción desbloqueará el acceso del usuario seleccionado';
        }

        return user && this.isUserSuspended(user)
            ? 'Esta acción reactivará el acceso del usuario seleccionado'
            : 'Esta acción suspenderá temporalmente el acceso del usuario seleccionado';
    }

    getStatusModalIcon(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'unlock';
        }

        return user && this.isUserSuspended(user) ? 'check' : 'ban';
    }

    getStatusModalBadge(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Solicitud de desbloqueo';
        }

        return user && this.isUserSuspended(user)
            ? 'Solicitud de reactivación'
            : 'Solicitud de suspensión';
    }

    getStatusModalWarning(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'El usuario bloqueado recuperará el acceso cuando el desbloqueo se procese correctamente.';
        }

        return user && this.isUserSuspended(user)
            ? 'El usuario suspendido volverá a tener acceso cuando la operación sea procesada correctamente.'
            : 'El usuario quedará suspendido y no podrá acceder mientras esté en ese estado.';
    }

    getStatusCommentPlaceholder(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'ESCRIBE EL MOTIVO DEL DESBLOQUEO';
        }

        return user && this.isUserSuspended(user)
            ? 'ESCRIBE EL MOTIVO DE LA REACTIVACIÓN'
            : 'ESCRIBE EL MOTIVO DE LA SUSPENSIÓN';
    }

    getStatusConfirmLabel(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Confirmar desbloqueo';
        }

        return user && this.isUserSuspended(user)
            ? 'Confirmar reactivación'
            : 'Confirmar suspensión';
    }

    isStatusReactivateOperation(): boolean {
        const user = this.statusTargetUser();

        return user
            ? this.isUserSuspended(user) || this.isUserBlocked(user)
            : false;
    }

    shouldShowStatusButton(user: UserRecord): boolean {
        return this.isAdminUser() && !this.isUserBaja(user) && !this.isUserBlocked(user);
    }

    shouldShowUnlockButton(user: UserRecord): boolean {
        return this.isAdminUser() && this.isUserBlocked(user);
    }

    shouldShowDeleteButton(user: UserRecord): boolean {
        return this.isAdminUser() && !this.isUserBaja(user);
    }

    statusOperationRequiresComment(): boolean {
        const user = this.statusTargetUser();
        return Boolean(user) && !this.isUserBlocked(user!);
    }

    isUserReadOnly(user: UserRecord): boolean {
        return (
            this.isCurrentSessionUser(user)
            || this.isUserBaja(user)
            || this.isUserSuspended(user)
            || this.isUserBlocked(user)
        );
    }

    isCurrentSessionUser(user: UserRecord): boolean {
        const sessionUser = this.authStorage.session()?.user;

        if (!sessionUser) {
            return false;
        }

        const currentUserId = this.toPositiveNumber(sessionUser.id);
        const targetUserId = this.resolveTargetUserId(user);

        if (currentUserId && targetUserId) {
            return currentUserId === targetUserId;
        }

        const currentUsername = this.normalizeForCompare(sessionUser.username);
        const targetUsername = this.normalizeForCompare(user.username);

        return Boolean(currentUsername) && currentUsername === targetUsername;
    }

    isUserBaja(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'BAJA';
    }

    isUserSuspended(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'SUSPENDIDO';
    }

    isUserBlocked(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'BLOQUEADO';
    }

    private prepareStatusModal(
        user: UserRecord,
        errorMessage: WritableSignal<string | null>,
        informationMessage: WritableSignal<string | null>,
    ): void {
        this.statusTargetUser.set(user);
        this.statusComment.set('');
        this.statusCommentError.set(null);
        errorMessage.set(null);
        informationMessage.set(null);
        this.isStatusModalOpen.set(true);

        if (!this.resolveTargetUserId(user)) {
            this.statusCommentError.set('No se encontró el identificador interno del usuario. Revisa el mapeo de usuarioId.');
        }
    }

    private showOperationSuccess(
        operation: AccountOperationKind,
        user: UserRecord,
        response: SolicitudOperacionResponse,
        onSuccess: () => void,
    ): void {
        const config = this.getOperationSuccessConfig(operation);
        const responseUserId = this.toPositiveNumber(response.datos?.usuarioId);

        this.operationSuccess.set({
            operation,
            title: config.title,
            heading: config.heading,
            message: response.mensaje?.trim() || config.defaultMessage,
            icon: config.icon,
            badge: 'Operación exitosa',
            newStatus: config.newStatus,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            userId: responseUserId ?? this.resolveTargetUserId(user) ?? user.userId,
        });

        onSuccess();
    }

    private getOperationSuccessConfig(operation: AccountOperationKind): {
        readonly title: string;
        readonly heading: string;
        readonly defaultMessage: string;
        readonly icon: string;
        readonly newStatus: string;
    } {
        switch (operation) {
            case 'baja':
                return {
                    title: 'Baja realizada correctamente',
                    heading: 'La cuenta fue dada de baja',
                    defaultMessage: 'La baja del usuario se procesó correctamente.',
                    icon: 'trash-2',
                    newStatus: 'Baja',
                };
            case 'suspension':
                return {
                    title: 'Suspensión realizada correctamente',
                    heading: 'La cuenta fue suspendida',
                    defaultMessage: 'La suspensión del usuario se procesó correctamente.',
                    icon: 'ban',
                    newStatus: 'Suspendido',
                };
            case 'reactivacion':
                return {
                    title: 'Reactivación realizada correctamente',
                    heading: 'La cuenta fue reactivada',
                    defaultMessage: 'La reactivación del usuario se procesó correctamente.',
                    icon: 'circle-check',
                    newStatus: 'Activo',
                };
            case 'desbloqueo':
                return {
                    title: 'Desbloqueo realizado correctamente',
                    heading: 'La cuenta fue desbloqueada',
                    defaultMessage: 'El desbloqueo del usuario se procesó correctamente.',
                    icon: 'unlock',
                    newStatus: 'Activo',
                };
        }

        const unsupportedOperation: never = operation;
        throw new Error(`Operación de cuenta no soportada: ${unsupportedOperation}`);
    }

    private validateOperationComment(value: string): string | null {
        const text = String(value ?? '').trim();
        const { min, max } = RESTRICTED_TEXT_LIMITS.comment;

        if (!text) {
            return 'El comentario es obligatorio.';
        }

        return getRestrictedTextError(text, min, max, 'El comentario');
    }

    private normalizeOperationCommentInput(value: unknown): string {
        const { max } = RESTRICTED_TEXT_LIMITS.comment;
        return sanitizeRestrictedText(value, max, true);
    }

    private resolveCurrentUserId(): number | null {
        const rawUserId = this.authStorage.session()?.user.id;
        const userId = Number(rawUserId);
        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }

    private resolveTargetUserId(user: UserRecord | null): number | null {
        if (!user) {
            return null;
        }

        const record = user as unknown as Record<string, unknown>;
        return this.toPositiveNumber(
            user.userId ??
            record['usuarioId'] ??
            record['idUsuario'] ??
            record['id_usuario'] ??
            record['id'] ??
            record['usuarioID'],
        );
    }

    private toPositiveNumber(value: unknown): number | null {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
    }

    private normalizeForCompare(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    getAccountStatusKey(user: UserRecord): string {
        const statusKey = String(user.statusKey ?? '').trim();

        if (statusKey) {
            return this.normalizeAccountStatusKey(statusKey);
        }

        return this.normalizeAccountStatusKey(user.status);
    }

    private normalizeAccountStatusKey(value: string): string {
        const normalizedValue = value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase();

        if (normalizedValue.includes('SUSPEND')) {
            return 'SUSPENDIDO';
        }

        if (normalizedValue.includes('BLOQUE')) {
            return 'BLOQUEADO';
        }

        if (
            normalizedValue === 'BAJA' ||
            normalizedValue.includes('DADO DE BAJA') ||
            normalizedValue.includes('INHABIL') ||
            normalizedValue.includes('DESHABIL') ||
            normalizedValue === 'INACTIVO'
        ) {
            return 'BAJA';
        }

        if (normalizedValue.includes('ACTIVO')) {
            return 'ACTIVO';
        }

        return normalizedValue;
    }

    private toFriendlyError(error: unknown): string {
        if (error instanceof Error) {
            if (error.name === 'TimeoutError') {
                return 'El servicio de detalle tardó demasiado en responder.';
            }
            return error.message;
        }
        return 'Ocurrió un error inesperado al consultar usuarios.';
    }
}
