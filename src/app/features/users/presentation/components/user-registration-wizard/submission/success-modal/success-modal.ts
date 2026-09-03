import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { SiauModal } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-success-modal',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauModal, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './success-modal.html',
})
export class SuccessModal extends UserRegistrationTemplateContext {
    readonly confirmed = output<void>();

    protected confirmClose(): void { this.confirmed.emit(); }
}
