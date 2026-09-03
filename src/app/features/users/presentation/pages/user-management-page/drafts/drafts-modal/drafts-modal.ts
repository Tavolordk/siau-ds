import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauModal } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserManagementTemplateContext } from '../../view/user-management-template.context';

@Component({
    selector: 'app-user-management-drafts-modal',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauModal, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './drafts-modal.html',
})
export class DraftsModal extends UserManagementTemplateContext {}
