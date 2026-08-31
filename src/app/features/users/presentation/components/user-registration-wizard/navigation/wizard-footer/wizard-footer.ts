import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-wizard-footer',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './wizard-footer.html',
})
export class WizardFooter extends UserRegistrationTemplateContext {
    readonly closeRequested = output<void>();

    protected requestClose(): void { this.closeRequested.emit(); }
}
