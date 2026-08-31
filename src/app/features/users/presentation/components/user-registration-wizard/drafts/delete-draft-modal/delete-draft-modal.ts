import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauModal } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-delete-draft-modal',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauModal, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './delete-draft-modal.html',
})
export class DeleteDraftModal extends UserRegistrationTemplateContext {}
