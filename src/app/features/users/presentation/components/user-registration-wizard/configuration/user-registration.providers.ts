import { Provider } from '@angular/core';
import { UserRegistrationCatalogCoordinator } from '../structure/user-registration-catalog.coordinator';
import { UserRegistrationContextFactory } from './user-registration-context.factory';
import { UserRegistrationDraftCoordinator } from '../drafts/user-registration-draft.coordinator';
import { UserRegistrationDraftProfileService } from '../drafts/user-registration-draft-profile.service';
import { UserRegistrationEditScopeController } from '../editing/user-registration-edit-scope.controller';
import { UserRegistrationFieldController } from '../editing/user-registration-field.controller';
import { UserRegistrationIdentityCoordinator } from '../identity/user-registration-identity.coordinator';
import { UserRegistrationLifecycleCoordinator } from '../lifecycle/user-registration-lifecycle.coordinator';
import { UserRegistrationNavigationController } from '../navigation/user-registration-navigation.controller';
import { UserRegistrationPresenter } from '../view/user-registration.presenter';
import { UserRegistrationProfileController } from '../profiles/user-registration-profile.controller';
import { UserRegistrationResetService } from '../lifecycle/user-registration-reset.service';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserRegistrationStructureController } from '../structure/user-registration-structure.controller';
import { UserRegistrationViewFacade } from '../view/user-registration-view.facade';
import { UserEditLockFacade } from '../../../../edit-lock/application/user-edit-lock.facade';
import { UserEditLockApiRepository } from '../../../../edit-lock/data-access/user-edit-lock-api.repository';
import { UserEditLockRepository } from '../../../../edit-lock/domain/user-edit-lock.repository';

/** Dependencias de alcance local al modal de registro/edición. */
export const USER_REGISTRATION_PROVIDERS: readonly Provider[] = [
    UserRegistrationIdentityCoordinator,
    UserRegistrationState,
    { provide: UserEditLockRepository, useClass: UserEditLockApiRepository },
    UserEditLockFacade,
    UserRegistrationPresenter,
    UserRegistrationFieldController,
    UserRegistrationEditScopeController,
    UserRegistrationNavigationController,
    UserRegistrationResetService,
    UserRegistrationContextFactory,
    UserRegistrationCatalogCoordinator,
    UserRegistrationDraftProfileService,
    UserRegistrationDraftCoordinator,
    UserRegistrationProfileController,
    UserRegistrationStructureController,
    UserRegistrationLifecycleCoordinator,
    UserRegistrationViewFacade,
];
