import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserManagementTemplateContext } from '../user-management-template.context';

@Component({
    selector: 'app-user-management-page-actions',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './page-actions.html',
})
export class PageActions extends UserManagementTemplateContext {}
