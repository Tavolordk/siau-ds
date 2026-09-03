import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UserManagementTemplateContext } from '../user-management-template.context';

@Component({
    selector: 'app-user-management-page-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    host: { style: 'display: contents' },
    templateUrl: './page-header.html',
})
export class PageHeader extends UserManagementTemplateContext { }
