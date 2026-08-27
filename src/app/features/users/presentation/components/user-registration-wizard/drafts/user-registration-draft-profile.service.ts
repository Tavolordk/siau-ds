import {
    DestroyRef,
    inject,
    Injectable,
    signal,
    WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogoOption, CatalogosFacade } from '../../../../../../core/catalogos';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { BorradorCatalogos, BorradorDatos } from '../../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    ProfileOrigin,
    SystemProfileFallbackOption,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../validation/user-registration-form.rules';
import { UserProfileMatcher } from '../profiles/user-profile.matcher';

@Injectable()
export class UserRegistrationDraftProfileService {
    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly profileMatcher = inject(UserProfileMatcher);
    private readonly destroyRef = inject(DestroyRef);
    private readonly requestedProfileFallbacks = new Set<string>();

    readonly fallbackOptions = signal<Record<string, readonly SystemProfileFallbackOption[]>>({});

    restoreProfiles(
        datos: BorradorDatos,
        catalogos: BorradorCatalogos | null,
        knownSystems: readonly SiauSelectOption[],
        rolesBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>,
        roleOptions: readonly SiauSelectOption[],
    ): AssignedSystemProfile[] {
        const sourceProfiles = datos.perfiles.length > 0
            ? datos.perfiles
            : datos.cuenta.sistemaId && datos.cuenta.perfilId
                ? [{ idSistema: datos.cuenta.sistemaId, idPerfil: datos.cuenta.perfilId }]
                : [];

        const seen = new Set<string>();
        const origin: ProfileOrigin = datos.comision ? 'comision' : 'adscripcion';

        return sourceProfiles.flatMap((profile, index) => {
            const systemId = profile.idSistema;
            const profileId = profile.idPerfil;
            if (!systemId || !profileId) return [];

            const systemValue = String(systemId);
            const roleValue = String(profileId);
            const key = `${systemValue}:${roleValue}`;
            if (seen.has(key)) return [];
            seen.add(key);

            const systemLabel = this.resolveSystemLabel(systemValue, knownSystems)
                || (index === 0 ? this.formRules.toText(catalogos?.sistema ?? '') : '')
                || systemValue;
            const roleDescription = index === 0
                ? this.formRules.toText(catalogos?.perfil ?? '')
                : '';

            return [{
                id: `${origin}-${systemValue}:${roleValue}`,
                system: systemValue,
                systemLabel,
                role: roleValue,
                origin,
                roleLabel: this.resolveRoleLabel(
                    systemValue,
                    roleValue,
                    systemLabel,
                    roleDescription,
                    rolesBySystem,
                    roleOptions,
                ) || roleDescription || roleValue,
                roleDescription,
            }];
        });
    }

    resolveSystemLabel(
        systemValue: string,
        knownSystems: readonly SiauSelectOption[],
    ): string {
        return this.formRules.toText(
            this.profileMatcher.findKnownSystemOption(systemValue, '', knownSystems)?.label ?? '',
        );
    }

    resolveRoleLabel(
        systemValue: string,
        roleValue: string,
        systemLabel: string,
        roleDescription: string,
        rolesBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>,
        roleOptions: readonly SiauSelectOption[],
    ): string {
        const fallback = this.fallbackOptions();
        const fallbackKey = this.formRules.normalizeText(systemLabel);
        const fallbackCandidates = [
            ...(fallback[fallbackKey] ?? []),
            ...Object.values(fallback).flat(),
        ];

        const normalizedDescription = this.formRules.normalizeText(roleDescription);
        const fallbackByDescription = normalizedDescription
            ? fallbackCandidates.find(
                (option) => this.formRules.normalizeText(option.description) === normalizedDescription,
            )
            : undefined;
        if (fallbackByDescription) {
            return this.formRules.toText(fallbackByDescription.label);
        }

        const fallbackById = fallbackCandidates.find((option) => option.value === roleValue);
        if (fallbackById) {
            return this.formRules.toText(fallbackById.label);
        }

        const structureCandidates = [
            ...(rolesBySystem[systemValue] ?? []),
            ...Object.values(rolesBySystem).flat(),
            ...roleOptions,
        ];

        return this.formRules.toText(
            structureCandidates.find((option) => option.value === roleValue)?.label ?? '',
        );
    }

    refreshAssignedProfileLabels(
        assignedProfiles: WritableSignal<AssignedSystemProfile[]>,
        knownSystems: readonly SiauSelectOption[],
        rolesBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>,
        roleOptions: readonly SiauSelectOption[],
    ): void {
        const current = assignedProfiles();
        if (!current.length) return;

        let changed = false;
        const next = current.map((profile) => {
            const systemLabel = this.resolveSystemLabel(profile.system, knownSystems) || profile.systemLabel;
            const fallbackKey = this.formRules.normalizeText(systemLabel);

            if (fallbackKey && !this.fallbackOptions()[fallbackKey]) {
                this.ensureSystemProfileFallback(systemLabel);
            }

            const roleLabel = this.resolveRoleLabel(
                profile.system,
                profile.role,
                systemLabel,
                profile.roleDescription ?? '',
                rolesBySystem,
                roleOptions,
            ) || profile.roleLabel;

            if (systemLabel === profile.systemLabel && roleLabel === profile.roleLabel) {
                return profile;
            }

            changed = true;
            return { ...profile, systemLabel, roleLabel };
        });

        if (changed) assignedProfiles.set(next);
    }

    private ensureSystemProfileFallback(systemLabel: string): void {
        const label = this.formRules.toText(systemLabel);
        const key = this.formRules.normalizeText(label);
        if (!key || this.requestedProfileFallbacks.has(key)) return;

        this.requestedProfileFallbacks.add(key);
        this.catalogosFacade
            .obtenerSistemaPerfilesOptions(label)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    this.fallbackOptions.update((current) => ({
                        ...current,
                        [key]: options.map((option) => {
                            const metadata = this.toRecord(option.metadata);
                            return {
                                value: this.resolveProfileOptionValue(option),
                                label: this.formRules.toText(
                                    metadata['clavePerfil']
                                    ?? metadata['perfilClave']
                                    ?? metadata['rolClave']
                                    ?? option.label,
                                ),
                                description: this.formRules.toText(
                                    metadata['descripcionPerfil']
                                    ?? metadata['perfilDescripcion']
                                    ?? option.label,
                                ),
                            };
                        }),
                    }));
                },
                error: (error: unknown) => {
                    console.warn(`No fue posible consultar los perfiles del sistema ${label}.`, error);
                },
            });
    }

    private resolveProfileOptionValue(option: CatalogoOption): string {
        const metadata = this.toRecord(option.metadata);
        const keys = ['perfilId', 'idPerfil', 'sistemaPerfilId', 'perfilSistemaId', 'rolId', 'idRol'];

        for (const key of keys) {
            const value = Number(metadata[key]);
            if (Number.isFinite(value) && value > 0) return String(value);
        }
        return option.value;
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
    }
}
