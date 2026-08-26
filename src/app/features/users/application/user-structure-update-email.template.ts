import type { CorreoRequest } from '../../../core/correo';

export type UserStructureEmailChangeType = 'adscripcion' | 'comision';

export interface UserStructureEmailChange {
    readonly type: UserStructureEmailChangeType;
    readonly previousValue: string;
    readonly newValue: string;
}

export interface UserStructureEmailProfile {
    readonly origin: UserStructureEmailChangeType;
    readonly system: string;
    readonly profile: string;
}

export interface UserStructureUpdateEmailTemplateInput {
    readonly recipient: string;
    readonly fullName: string;
    readonly account: string;
    readonly temporaryPassword: string;
    readonly changes: readonly UserStructureEmailChange[];
    readonly addedProfiles: readonly UserStructureEmailProfile[];
}

export function buildUserStructureUpdateEmailRequest(
    input: UserStructureUpdateEmailTemplateInput,
): CorreoRequest {
    const fullName = escapeHtml(input.fullName || 'Usuario(a)');
    const account = escapeHtml(input.account || 'No disponible');
    const temporaryPassword = escapeHtml(input.temporaryPassword || 'No disponible');
    const subjectScope = resolveSubjectScope(input.changes);
    const changeRows = input.changes.length > 0
        ? input.changes.map(renderChangeRow).join('')
        : `<tr>
            <td style="padding:8px 32px;color:#62748e;font-size:13px;line-height:1.5;">
              El cambio fue procesado correctamente. Inicia sesión con las nuevas credenciales indicadas en este correo.
            </td>
          </tr>`;
    const profiles = input.addedProfiles.length > 0
        ? input.addedProfiles.map(renderProfileRow).join('')
        : `<tr>
            <td style="padding:13px 16px;color:#62748e;font-size:13px;line-height:1.5;border-top:1px solid #e4ebf1;">
              No se agregaron perfiles nuevos durante esta actualización.
            </td>
          </tr>`;

    return {
        to: [input.recipient],
        fromName: 'SIAU · Secretaría de Seguridad y Protección Ciudadana',
        subject: 'SIAU | Tu nueva cuenta de acceso está lista',
        isHtml: true,
        body: `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Tu nueva cuenta SIAU está lista</title>
  </head>
  <body style="margin:0;padding:0;background:#edf3f8;color:#1b1f4a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background:#edf3f8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #d5e0ea;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 26px;background:#1b1f4a;border-bottom:4px solid #8494a8;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.08em;line-height:1;">SIAU</div>
                      <div style="margin-top:9px;color:#dce6ef;font-size:11px;font-weight:700;letter-spacing:0.07em;line-height:1.5;text-transform:uppercase;">Sistema Integral de Administración de Usuarios</div>
                    </td>
                    <td align="right" style="vertical-align:top;">
                      <span style="display:inline-block;padding:7px 10px;border:1px solid rgba(255,255,255,0.42);border-radius:999px;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.05em;line-height:1;text-transform:uppercase;">Nueva cuenta</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 12px;">
                <p style="margin:0 0 8px;color:#8494a8;font-size:11px;font-weight:700;letter-spacing:0.08em;line-height:1.35;text-transform:uppercase;">Actualización confirmada</p>
                <h1 style="margin:0;color:#1b1f4a;font-size:27px;font-weight:800;line-height:1.2;">Tu nueva cuenta SIAU está lista</h1>
                <p style="margin:14px 0 0;color:#4f6076;font-size:15px;line-height:1.6;">Hola, <strong style="color:#1b1f4a;">${fullName}</strong>. La actualización de ${escapeHtml(subjectScope)} fue procesada correctamente y se generaron nuevas credenciales de acceso. A partir de ahora utiliza la siguiente cuenta y contraseña temporal.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f4f8fb;border:1px solid #d5e0ea;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.08em;line-height:1.3;text-transform:uppercase;">Nueva cuenta SIAU</div>
                      <div style="margin-top:6px;color:#1b1f4a;font-size:21px;font-weight:800;line-height:1.35;word-break:break-word;">${account}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff8e9;border:1px solid #ead7a7;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="color:#8a641d;font-size:10px;font-weight:700;letter-spacing:0.08em;line-height:1.3;text-transform:uppercase;">Contraseña temporal</div>
                      <div style="margin-top:6px;color:#1b1f4a;font-size:21px;font-weight:800;letter-spacing:0.04em;line-height:1.35;word-break:break-word;">${temporaryPassword}</div>
                      <div style="margin-top:7px;color:#76531b;font-size:12px;line-height:1.5;">Utilízala en tu próximo acceso y cámbiala cuando el sistema lo solicite. No la compartas.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 6px;">
                <p style="margin:0;color:#1b1f4a;font-size:15px;font-weight:800;line-height:1.4;">Cambios realizados</p>
              </td>
            </tr>
            ${changeRows}
            <tr>
              <td style="padding:22px 32px 8px;">
                <p style="margin:0;color:#1b1f4a;font-size:15px;font-weight:800;line-height:1.4;">Perfiles agregados</p>
                <p style="margin:6px 0 0;color:#62748e;font-size:12px;line-height:1.5;">Estos son únicamente los perfiles nuevos agregados durante esta actualización; no se incluyen los que el usuario ya tenía previamente.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #d5e0ea;border-radius:12px;overflow:hidden;">
                  ${profiles}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff8e9;border-left:4px solid #b9811f;border-radius:8px;">
                  <tr>
                    <td style="padding:13px 15px;color:#76531b;font-size:12px;line-height:1.55;"><strong>Importante:</strong> SIAU nunca solicitará tu contraseña por llamada, mensaje o correo. Si no reconoces esta actualización o alguno de los datos es incorrecto, comunícate con la mesa de ayuda institucional.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:17px 32px;background:#f4f8fb;border-top:1px solid #dce6ef;">
                <p style="margin:0;color:#8494a8;font-size:10px;line-height:1.5;text-align:center;">Mensaje automático de SIAU · Secretaría de Seguridad y Protección Ciudadana</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    };
}

function renderChangeRow(change: UserStructureEmailChange): string {
    const label = change.type === 'comision' ? 'Comisión' : 'Adscripción';
    const previousValue = escapeHtml(change.previousValue || 'Sin información');
    const newValue = escapeHtml(change.newValue || 'Sin información');

    return `<tr>
      <td style="padding:8px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #d5e0ea;border-radius:12px;overflow:hidden;">
          <tr>
            <td colspan="2" style="padding:13px 16px;background:#f4f8fb;color:#1b1f4a;font-size:13px;font-weight:800;line-height:1.4;">${label}</td>
          </tr>
          <tr>
            <td width="50%" style="padding:14px 16px;vertical-align:top;border-right:1px solid #e4ebf1;">
              <div style="color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;">Anterior</div>
              <div style="margin-top:7px;color:#4f6076;font-size:13px;line-height:1.55;">${previousValue}</div>
            </td>
            <td width="50%" style="padding:14px 16px;vertical-align:top;">
              <div style="color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;">Nueva</div>
              <div style="margin-top:7px;color:#1b1f4a;font-size:13px;font-weight:700;line-height:1.55;">${newValue}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderProfileRow(profile: UserStructureEmailProfile): string {
    const origin = profile.origin === 'comision' ? 'Comisión' : 'Adscripción';
    const system = escapeHtml(profile.system || 'Sistema no identificado');
    const profileName = escapeHtml(profile.profile || 'Perfil no identificado');

    return `<tr>
      <td style="padding:13px 16px;border-top:1px solid #e4ebf1;">
        <div style="color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;">${origin}</div>
        <div style="margin-top:5px;color:#1b1f4a;font-size:13px;font-weight:800;line-height:1.4;">${system}</div>
        <div style="margin-top:3px;color:#4f6076;font-size:13px;line-height:1.45;">${profileName}</div>
      </td>
    </tr>`;
}

function resolveSubjectScope(changes: readonly UserStructureEmailChange[]): string {
    const hasAdscripcion = changes.some((change) => change.type === 'adscripcion');
    const hasComision = changes.some((change) => change.type === 'comision');

    if (hasAdscripcion && hasComision) {
        return 'adscripción y comisión';
    }

    return hasComision ? 'comisión' : 'adscripción';
}

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
