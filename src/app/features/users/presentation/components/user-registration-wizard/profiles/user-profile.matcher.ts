import { inject, Injectable } from '@angular/core';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { CatalogoRecord } from '../../../../../../core/catalogos';
import {
    AssignedSystemProfile,
    ProfileOrigin,
    StructureProfileCatalog,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../rules/user-registration-form.rules';

@Injectable({ providedIn: 'root' })
export class UserProfileMatcher {
    private readonly formRules = inject(UserRegistrationFormRules);

    toAssignedSystemProfiles(
        value: unknown,
        fallbackOrigin: ProfileOrigin,
        knownSystems: readonly SiauSelectOption[],
    ): AssignedSystemProfile[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item, index) => {
                const record = this.toRecord(item);
                const rawSystemLabel = this.formRules.toText(
                    this.firstValue(record, ['sistema', 'sistemaClave', 'nombreSistema', 'sistemaNombre', 'systemLabel']),
                );
                const rawSystemId = this.formRules.toText(
                    this.firstValue(record, ['sistemaId', 'idSistema', 'system']),
                );
                const rawRoleLabel = this.formRules.toText(
                    this.firstValue(record, [
                        'descripcionPerfil',
                        'perfil',
                        'rol',
                        'perfilClave',
                        'rolClave',
                        'nombrePerfil',
                        'perfilNombre',
                        'roleLabel',
                    ]),
                );
                const rawRoleId = this.formRules.toText(
                    this.firstValue(record, ['perfilId', 'rolId', 'idPerfil', 'role']),
                );
                const origin = this.toProfileOrigin(
                    this.firstValue(record, ['origenTipo', 'origen', 'originType', 'origin']),
                    fallbackOrigin,
                );
                const systemOption = this.findKnownSystemOption(
                    rawSystemId,
                    rawSystemLabel,
                    knownSystems,
                );
                const systemValue = systemOption?.value || rawSystemId || rawSystemLabel;
                const systemLabel = rawSystemLabel || systemOption?.label || systemValue;
                const roleValue = rawRoleId || rawRoleLabel;
                const roleLabel = rawRoleLabel;

                if (!systemValue || !systemLabel || !roleValue || !roleLabel) {
                    return null;
                }

                return {
                    id: `${origin}-${systemValue}-${roleValue}-${index}`,
                    system: systemValue,
                    role: roleValue,
                    systemLabel,
                    roleLabel,
                    origin,
                } satisfies AssignedSystemProfile;
            })
            .filter((item): item is AssignedSystemProfile => item !== null);
    }

    buildDetailRoleOptionsBySystem(
        profiles: readonly AssignedSystemProfile[],
        knownSystems: readonly SiauSelectOption[],
    ): Record<string, readonly SiauSelectOption[]> {
        const result: Record<string, SiauSelectOption[]> = {};

        profiles.forEach((profile) => {
            if (!profile.system || !profile.systemLabel || !profile.role || !profile.roleLabel) {
                return;
            }

            this.addRoleOptionForSystemKey(result, profile.system, profile);
            this.addRoleOptionForSystemKey(result, profile.systemLabel, profile);

            const systemOption = this.findKnownSystemOption(
                profile.system,
                profile.systemLabel,
                knownSystems,
            );

            if (systemOption) {
                this.addRoleOptionForSystemKey(result, systemOption.value, profile);
                this.addRoleOptionForSystemKey(result, systemOption.label, profile);
            }
        });

        return result;
    }

    findDetailRoleOptionsForSystem(
        system: string,
        roleOptionsBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>,
        knownSystems: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        const cleanSystem = this.formRules.toText(system);

        if (!cleanSystem) {
            return [];
        }

        if (roleOptionsBySystem[cleanSystem]?.length) {
            return roleOptionsBySystem[cleanSystem];
        }

        const systemOption = this.findKnownSystemOption(cleanSystem, '', knownSystems);
        const candidateKeys = [
            cleanSystem,
            systemOption?.value ?? '',
            systemOption?.label ?? '',
        ].filter(Boolean);

        for (const candidateKey of candidateKeys) {
            const options = roleOptionsBySystem[candidateKey];
            if (options?.length) {
                return options;
            }
        }

        const normalizedSystem = this.formRules.normalizeText(cleanSystem);
        const matchedKey = Object.keys(roleOptionsBySystem).find(
            (key) => this.formRules.normalizeText(key) === normalizedSystem,
        );

        return matchedKey ? roleOptionsBySystem[matchedKey] ?? [] : [];
    }

    findKnownSystemOption(
        systemValue: string,
        systemLabel: string,
        knownSystems: readonly SiauSelectOption[],
    ): SiauSelectOption | undefined {
        const cleanValue = this.formRules.toText(systemValue);
        const cleanLabel = this.formRules.toText(systemLabel);

        return knownSystems.find((option) => {
            const metadataSystemId = this.firstNumberValue(
                this.optionMetadata(option),
                ['idSistema', 'sistemaId', 'IdSistema', 'SistemaId', 'id'],
            );

            return (
                option.value === cleanValue ||
                this.formRules.normalizeText(option.value) === this.formRules.normalizeText(cleanValue) ||
                this.formRules.normalizeText(option.label) === this.formRules.normalizeText(cleanValue) ||
                (metadataSystemId !== null && String(metadataSystemId) === cleanValue) ||
                (cleanLabel.length > 0 &&
                    this.formRules.normalizeText(option.label) === this.formRules.normalizeText(cleanLabel))
            );
        });
    }

    isSiauSystem(
        systemValue: string,
        systemLabel: string,
        knownSystems: readonly SiauSelectOption[],
    ): boolean {
        const cleanValue = this.formRules.toText(systemValue);
        const option = this.findKnownSystemOption(cleanValue, systemLabel, knownSystems);
        const candidates = [cleanValue, systemLabel, option?.label ?? '', option?.value ?? ''];

        return candidates.some((candidate) => {
            const normalized = this.formRules.normalizeText(candidate);
            return normalized === 'siau' ||
                normalized.includes('siau') ||
                normalized.includes('sistema integral de administracion de usuarios');
        });
    }

    isDefaultSiauRole(roleValue: string, roleLabel = ''): boolean {
        return [roleValue, roleLabel].some(
            (value) => this.formRules.normalizeText(this.formRules.toText(value)) === 'usuario',
        );
    }

    isRoleAlreadyAssigned(
        system: string,
        roleOption: SiauSelectOption,
        assignedProfiles: readonly AssignedSystemProfile[],
        activeOrigin: ProfileOrigin,
        knownSystems: readonly SiauSelectOption[],
    ): boolean {
        const systemOption = this.findKnownSystemOption(system, '', knownSystems);

        return assignedProfiles.some((profile) => {
            if (profile.origin !== activeOrigin) {
                return false;
            }

            const sameSystem =
                profile.system === system ||
                this.formRules.normalizeText(profile.system) === this.formRules.normalizeText(system) ||
                this.formRules.normalizeText(profile.systemLabel) === this.formRules.normalizeText(system) ||
                this.formRules.normalizeText(profile.system) === this.formRules.normalizeText(systemOption?.value ?? '') ||
                this.formRules.normalizeText(profile.systemLabel) === this.formRules.normalizeText(systemOption?.label ?? '');

            if (!sameSystem) {
                return false;
            }

            return (
                profile.role === roleOption.value ||
                this.formRules.normalizeText(profile.role) === this.formRules.normalizeText(roleOption.value) ||
                this.formRules.normalizeText(profile.roleLabel) === this.formRules.normalizeText(roleOption.label)
            );
        });
    }


    buildStructureProfileCatalog(
        items: readonly CatalogoRecord[],
        allSystemOptions: readonly SiauSelectOption[],
    ): StructureProfileCatalog {
        const systems: Array<SiauSelectOption & { metadata?: Record<string, unknown> }> = [];
        const rolesBySystem: Record<string, SiauSelectOption[]> = {};

        items.forEach((item) => {
            const record = this.toRecord(item);
            const nestedSystem = this.toRecord(
                record['sistemaDetalle'] ?? record['sistemaCatalogo'] ?? record['sistema'],
            );
            const nestedProfile = this.toRecord(
                record['perfilDetalle'] ?? record['perfilCatalogo'] ?? record['perfil'],
            );

            const rawSystemId = this.firstText([
                this.firstValue(record, ['sistemaId', 'idSistema', 'SistemaId', 'IdSistema']),
                this.firstValue(nestedSystem, ['id', 'sistemaId', 'idSistema']),
            ]);
            const rawSystemLabel = this.firstText([
                this.firstValue(record, [
                    'sistema', 'sistemaNombre', 'nombreSistema', 'sistemaClave',
                    'claveSistema', 'descripcionSistema',
                ]),
                this.firstValue(nestedSystem, ['sistema', 'nombre', 'clave', 'descripcion']),
            ]);

            const globalSystem = allSystemOptions.find((option) => {
                const metadataSystemId = this.firstNumberValue(
                    this.optionMetadata(option),
                    ['id', 'idSistema', 'sistemaId'],
                );
                return (
                    option.value === rawSystemId ||
                    this.formRules.normalizeText(option.value) === this.formRules.normalizeText(rawSystemId) ||
                    this.formRules.normalizeText(option.label) === this.formRules.normalizeText(rawSystemLabel) ||
                    (metadataSystemId !== null && String(metadataSystemId) === rawSystemId)
                );
            });
            const systemValue = globalSystem?.value || rawSystemId || rawSystemLabel;
            const systemLabel = rawSystemLabel || globalSystem?.label || systemValue;

            const rawProfileId = this.firstText([
                this.firstValue(record, ['perfilId', 'idPerfil', 'rolId', 'idRol', 'PerfilId', 'IdPerfil']),
                this.firstValue(nestedProfile, ['id', 'perfilId', 'idPerfil', 'rolId']),
            ]);
            const rawProfileLabel = this.firstText([
                this.firstValue(record, [
                    'perfilDescripcion', 'descripcionPerfil', 'nombrePerfil', 'perfilNombre',
                    'perfilClave', 'clavePerfil', 'rolNombre', 'rol', 'perfil',
                ]),
                this.firstValue(nestedProfile, ['nombre', 'descripcion', 'clave', 'perfil', 'rol']),
            ]);
            const profileValue = rawProfileId || rawProfileLabel;
            const profileLabel = rawProfileLabel || profileValue;

            if (!systemValue || !systemLabel || !profileValue || !profileLabel) {
                return;
            }

            if (!systems.some((option) => option.value === systemValue)) {
                systems.push({
                    value: systemValue,
                    label: systemLabel,
                    metadata: {
                        ...this.optionMetadata(globalSystem),
                        ...record,
                    },
                });
            }

            const profileOption: SiauSelectOption = { value: profileValue, label: profileLabel };
            [systemValue, systemLabel, globalSystem?.value ?? '', globalSystem?.label ?? '']
                .filter(Boolean)
                .forEach((systemKey) =>
                    this.addStructureRoleOption(rolesBySystem, systemKey, profileOption),
                );
        });

        return { systems, rolesBySystem };
    }

    findStructureRoleOptionsForSystem(
        system: string,
        rolesBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>,
        systemOptions: readonly SiauSelectOption[],
        allSystemOptions: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        const cleanSystem = this.formRules.toText(system);
        if (!cleanSystem) return [];

        if (rolesBySystem[cleanSystem]?.length) {
            return rolesBySystem[cleanSystem];
        }

        const systemOption = [...systemOptions, ...allSystemOptions].find(
            (option) =>
                option.value === cleanSystem ||
                this.formRules.normalizeText(option.value) === this.formRules.normalizeText(cleanSystem) ||
                this.formRules.normalizeText(option.label) === this.formRules.normalizeText(cleanSystem),
        );
        const candidateKeys = [cleanSystem, systemOption?.value ?? '', systemOption?.label ?? '']
            .filter(Boolean);

        for (const candidateKey of candidateKeys) {
            const options = rolesBySystem[candidateKey];
            if (options?.length) return options;
        }

        const normalizedSystem = this.formRules.normalizeText(cleanSystem);
        const matchedKey = Object.keys(rolesBySystem).find(
            (key) => this.formRules.normalizeText(key) === normalizedSystem,
        );
        return matchedKey ? rolesBySystem[matchedKey] ?? [] : [];
    }

    private addRoleOptionForSystemKey(
        accumulator: Record<string, SiauSelectOption[]>,
        systemKey: string,
        profile: AssignedSystemProfile,
    ): void {
        const cleanSystemKey = this.formRules.toText(systemKey);
        if (!cleanSystemKey) {
            return;
        }

        const currentOptions = accumulator[cleanSystemKey] ?? [];
        const alreadyExists = currentOptions.some(
            (option) =>
                option.value === profile.role ||
                this.formRules.normalizeText(option.label) === this.formRules.normalizeText(profile.roleLabel),
        );

        if (alreadyExists) {
            return;
        }

        accumulator[cleanSystemKey] = [
            ...currentOptions,
            { value: profile.role, label: profile.roleLabel },
        ];
    }

    private addStructureRoleOption(
        accumulator: Record<string, SiauSelectOption[]>,
        systemKey: string,
        profileOption: SiauSelectOption,
    ): void {
        const cleanSystemKey = this.formRules.toText(systemKey);
        if (!cleanSystemKey) return;

        const current = accumulator[cleanSystemKey] ?? [];
        const exists = current.some((option) =>
            option.value === profileOption.value ||
            this.formRules.normalizeText(option.label) === this.formRules.normalizeText(profileOption.label),
        );

        if (!exists) {
            accumulator[cleanSystemKey] = [...current, profileOption];
        }
    }

    private firstText(values: readonly unknown[]): string {
        return values
            .map((value) => this.formRules.toText(value))
            .find((value) => value.length > 0) ?? '';
    }

    private toProfileOrigin(value: unknown, fallback: ProfileOrigin): ProfileOrigin {
        const normalized = this.formRules.normalizeText(this.formRules.toText(value));
        return normalized === 'comision'
            ? 'comision'
            : normalized === 'adscripcion'
                ? 'adscripcion'
                : fallback;
    }

    private optionMetadata(option: SiauSelectOption | undefined): Record<string, unknown> {
        const metadata = (option as { metadata?: Record<string, unknown> } | undefined)?.metadata;
        return this.toRecord(metadata);
    }

    private firstNumberValue(record: Record<string, unknown>, keys: readonly string[]): number | null {
        for (const key of keys) {
            const value = Number(record[key]);
            if (Number.isFinite(value) && value > 0) {
                return value;
            }
        }
        return null;
    }

    private firstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
        for (const key of keys) {
            if (record[key] !== null && record[key] !== undefined) {
                return record[key];
            }
        }
        return null;
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return typeof value === 'object' && value !== null
            ? value as Record<string, unknown>
            : {};
    }
}
