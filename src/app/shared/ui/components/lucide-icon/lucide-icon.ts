import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const ICON_ALIASES: Record<string, string> = {
  // Material -> Lucide / SIAU aliases
  add: 'plus',
  edit: 'pencil',
  delete: 'trash-2',
  block: 'ban',
  visibility: 'eye',
  search: 'search',
  close: 'x',
  check: 'check',
  check_circle: 'circle-check',
  cancel: 'circle-x',
  error: 'circle-x',
  warning: 'triangle-alert',
  info: 'info',
  help: 'circle-help',
  upload: 'upload',
  upload_file: 'upload',
  download: 'download',

  /*
    IMPORTANTE:
    No cambié filter_list a funnel para no afectar otros módulos.
    Si quieres el icono tipo embudo del Figma, usa directamente name="funnel".
  */
  filter_list: 'sliders-horizontal',
  filter: 'sliders-horizontal',

  settings: 'settings',
  tune: 'settings-2',
  group: 'users',
  groups: 'users',
  person: 'user',
  account_circle: 'user',
  configuracion: 'settings',
  logout: 'log-out',
  cerrar_sesion: 'log-out',
  person_add: 'user-plus',
  description: 'file-text',
  article: 'file-text',
  insert_chart: 'chart-column',
  timeline: 'activity',
  monitoring: 'activity',
  view_sidebar: 'panel-left-close',
  chevron_right: 'chevron-right',
  chevron_left: 'chevron-left',
  keyboard_arrow_down: 'chevron-down',
  account_tree: 'git-branch',
  admin_panel_settings: 'shield-check',
  business: 'building-2',

  /*
    No muevo business_center/work al briefcase normal para no cambiar
    pantallas que ya usaban briefcase-business.
    Para Comisión usa name="briefcase" o name="figma-briefcase-simple".
  */
  business_center: 'briefcase-business',
  brief: 'briefcase-business',
  work: 'briefcase-business',

  phone: 'phone',
  shield: 'shield',
  vpn_key: 'key',
  key: 'key',
  layers: 'layers',
  storage: 'database',
  lock_open: 'lock',
  notifications: 'bell',
  dns: 'server',
  schedule: 'clock',
  trending_up: 'trending-up',

  // Aliases seguros para solicitudes
  funnel_filter: 'funnel',
  request_filter: 'funnel',
};

const LUCIDE_ICONS: Record<string, string> = {
  user: `
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  `,

  users: `
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  `,

  'user-plus': `
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <line x1="19" x2="19" y1="8" y2="14"></line>
    <line x1="22" x2="16" y1="11" y2="11"></line>
  `,

  'clipboard-list': `
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <path d="M12 11h4"></path>
    <path d="M12 16h4"></path>
    <path d="M8 11h.01"></path>
    <path d="M8 16h.01"></path>
  `,

  'settings-2': `
    <path d="M20 7h-9"></path>
    <path d="M14 17H5"></path>
    <circle cx="17" cy="17" r="3"></circle>
    <circle cx="7" cy="7" r="3"></circle>
  `,

  settings: `
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  `,

  'log-out': `
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" x2="9" y1="12" y2="12"></line>
  `,

  'file-text': `
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
    <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
    <path d="M10 9H8"></path>
    <path d="M16 13H8"></path>
    <path d="M16 17H8"></path>
  `,

  activity: `
    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path>
  `,

  layers: `
    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path>
    <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path>
    <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>
  `,

  plus: `
    <path d="M5 12h14"></path>
    <path d="M12 5v14"></path>
  `,

  search: `
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.3-4.3"></path>
  `,

  pencil: `
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path>
    <path d="m15 5 4 4"></path>
  `,

  ban: `
    <circle cx="12" cy="12" r="10"></circle>
    <path d="m4.9 4.9 14.2 14.2"></path>
  `,

  'trash-2': `
    <path d="M3 6h18"></path>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
    <line x1="10" x2="10" y1="11" y2="17"></line>
    <line x1="14" x2="14" y1="11" y2="17"></line>
  `,

  eye: `
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
    <circle cx="12" cy="12" r="3"></circle>
  `,

  'eye-off': `
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"></path>
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path>
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"></path>
    <path d="m2 2 20 20"></path>
  `,

  'circle-check': `
    <circle cx="12" cy="12" r="10"></circle>
    <path d="m9 12 2 2 4-4"></path>
  `,

  'circle-x': `
    <circle cx="12" cy="12" r="10"></circle>
    <path d="m15 9-6 6"></path>
    <path d="m9 9 6 6"></path>
  `,

  check: `
    <path d="M20 6 9 17l-5-5"></path>
  `,

  x: `
    <path d="M18 6 6 18"></path>
    <path d="m6 6 12 12"></path>
  `,

  'chevron-right': `
    <path d="m9 18 6-6-6-6"></path>
  `,

  'chevron-left': `
    <path d="m15 18-6-6 6-6"></path>
  `,

  'chevron-down': `
    <path d="m6 9 6 6 6-6"></path>
  `,

  menu: `
    <line x1="4" x2="20" y1="12" y2="12"></line>
    <line x1="4" x2="20" y1="6" y2="6"></line>
    <line x1="4" x2="20" y1="18" y2="18"></line>
  `,

  'panel-left-close': `
    <rect width="18" height="18" x="3" y="3" rx="2"></rect>
    <path d="M9 3v18"></path>
    <path d="m16 15-3-3 3-3"></path>
  `,

  'panel-left-open': `
    <rect width="18" height="18" x="3" y="3" rx="2"></rect>
    <path d="M9 3v18"></path>
    <path d="m14 9 3 3-3 3"></path>
  `,

  'refresh-cw': `
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
    <path d="M21 3v5h-5"></path>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
    <path d="M8 16H3v5"></path>
  `,

  download: `
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" x2="12" y1="15" y2="3"></line>
  `,

  upload: `
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" x2="12" y1="3" y2="15"></line>
  `,

  'sliders-horizontal': `
    <line x1="21" x2="14" y1="4" y2="4"></line>
    <line x1="10" x2="3" y1="4" y2="4"></line>
    <line x1="21" x2="12" y1="12" y2="12"></line>
    <line x1="8" x2="3" y1="12" y2="12"></line>
    <line x1="21" x2="16" y1="20" y2="20"></line>
    <line x1="12" x2="3" y1="20" y2="20"></line>
    <line x1="14" x2="14" y1="2" y2="6"></line>
    <line x1="8" x2="8" y1="10" y2="14"></line>
    <line x1="16" x2="16" y1="18" y2="22"></line>
  `,

  funnel: `
    <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"></path>
  `,

  'trending-up': `
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
    <polyline points="16 7 22 7 22 13"></polyline>
  `,

  'building-2': `
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path>
    <path d="M6 12H4a2 2 0 0 0-2 2v8h20v-8a2 2 0 0 0-2-2h-2"></path>
    <path d="M10 6h4"></path>
    <path d="M10 10h4"></path>
    <path d="M10 14h4"></path>
    <path d="M10 18h4"></path>
  `,

  /*
    Este se conserva porque ya lo usabas en otros alias.
  */
  'briefcase-business': `
    <path d="M12 12h.01"></path>
    <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path>
    <path d="M22 13a18.15 18.15 0 0 1-20 0"></path>
    <rect width="20" height="14" x="2" y="6" rx="2"></rect>
  `,

  /*
    Este es el briefcase simple para Comisión.
  */
  briefcase: `
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
    <rect width="20" height="14" x="2" y="6" rx="2"></rect>
  `,

  /*
    Nombre alterno por si quieres usar explícitamente el del Figma
    sin tocar briefcase ni briefcase-business.
  */
  'figma-briefcase-simple': `
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
    <rect width="20" height="14" x="2" y="6" rx="2"></rect>
  `,

  shield: `
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
  `,

  'shield-check': `
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
    <path d="m9 12 2 2 4-4"></path>
  `,

  key: `
    <circle cx="7.5" cy="15.5" r="5.5"></circle>
    <path d="m21 2-9.6 9.6"></path>
    <path d="m15.5 7.5 3 3L22 7l-3-3"></path>
  `,

  'key-round': `
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"></path>
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"></circle>
  `,

  phone: `
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.89.32 1.76.6 2.6a2 2 0 0 1-.45 2.11L8 9.64a16 16 0 0 0 6.36 6.36l1.21-1.21a2 2 0 0 1 2.11-.45c.84.28 1.71.48 2.6.6A2 2 0 0 1 22 16.92z"></path>
  `,

  'git-branch': `
    <line x1="6" x2="6" y1="3" y2="15"></line>
    <circle cx="18" cy="6" r="3"></circle>
    <circle cx="6" cy="18" r="3"></circle>
    <path d="M18 9a9 9 0 0 1-9 9"></path>
  `,

  'chart-column': `
    <path d="M3 3v18h18"></path>
    <path d="M18 17V9"></path>
    <path d="M13 17V5"></path>
    <path d="M8 17v-3"></path>
  `,

  info: `
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 16v-4"></path>
    <path d="M12 8h.01"></path>
  `,

  'triangle-alert': `
    <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>
    <path d="M12 9v4"></path>
    <path d="M12 17h.01"></path>
  `,

  'circle-help': `
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <path d="M12 17h.01"></path>
  `,

  database: `
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M3 5v14a9 3 0 0 0 18 0V5"></path>
    <path d="M3 12a9 3 0 0 0 18 0"></path>
  `,

  lock: `
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  `,

  bell: `
    <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
  `,

  server: `
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect>
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect>
    <line x1="6" x2="6.01" y1="6" y2="6"></line>
    <line x1="6" x2="6.01" y1="18" y2="18"></line>
  `,

  clock: `
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  `,
};

@Component({
  selector: 'siau-lucide-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="siau-lucide-icon" [innerHTML]="svg()"></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
        color: currentColor;
        flex: none;
      }

      .siau-lucide-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
      }
    `,
  ],
})
export class SiauLucideIcon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<string>();
  readonly size = input<number | string>(24);
  readonly strokeWidth = input<number | string>(2);

  protected readonly svg = computed<SafeHtml>(() => {
    const requestedName = this.name();
    const normalizedName = ICON_ALIASES[requestedName] ?? requestedName;
    const icon = LUCIDE_ICONS[normalizedName] ?? LUCIDE_ICONS['triangle-alert'];

    return this.sanitizer.bypassSecurityTrustHtml(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="${this.size()}"
        height="${this.size()}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="${this.strokeWidth()}"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        ${icon}
      </svg>
    `);
  });
}