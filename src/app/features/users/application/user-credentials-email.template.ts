import { CorreoRequest } from '../../../core/correo';

export interface UserCredentialsEmailTemplateInput {
    readonly recipient: string;
    readonly fullName: string;
    readonly account: string;
    readonly email: string;
    readonly phone: string;
    readonly system: string;
    readonly temporaryPassword: string;
}

export function buildUserCredentialsEmailRequest(
    input: UserCredentialsEmailTemplateInput,
): CorreoRequest {
    const fullName = escapeHtml(input.fullName || 'Usuario(a)');
    const account = escapeHtml(input.account);
    const email = escapeHtml(input.email);
    const phone = escapeHtml(formatPhone(input.phone));
    const system = escapeHtml(input.system || 'SIAU');
    const temporaryPassword = escapeHtml(input.temporaryPassword);
    const accountType = 'cuenta de acceso';

    return {
        to: [input.recipient],
        fromName: 'SIAU · Secretaría de Seguridad y Protección Ciudadana',
        subject: 'SIAU | Tu cuenta de acceso está lista',
        isHtml: true,
        body: `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Tu cuenta SIAU está lista</title>
  </head>
  <body style="margin:0;padding:0;background:#edf3f8;color:#1b1f4a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background:#edf3f8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #d5e0ea;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 26px;background:#1b1f4a;border-bottom:4px solid #8494a8;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.08em;line-height:1;">SIAU</div>
                      <div style="margin-top:9px;color:#dce6ef;font-size:11px;font-weight:700;letter-spacing:0.07em;line-height:1.5;text-transform:uppercase;">Sistema Integral de Administración de Usuarios</div>
                    </td>
                    <td align="right" style="vertical-align:top;">
                      <span style="display:inline-block;padding:7px 10px;border:1px solid rgba(255,255,255,0.42);border-radius:999px;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.05em;line-height:1;text-transform:uppercase;">Acceso habilitado</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 12px;">
                <p style="margin:0 0 8px;color:#8494a8;font-size:11px;font-weight:700;letter-spacing:0.08em;line-height:1.35;text-transform:uppercase;">Registro confirmado</p>
                <h1 style="margin:0;color:#1b1f4a;font-size:27px;font-weight:800;line-height:1.2;">Tu ${accountType} está lista</h1>
                <p style="margin:14px 0 0;color:#4f6076;font-size:15px;line-height:1.6;">Hola, <strong style="color:#1b1f4a;">${fullName}</strong>. Tu registro en <strong style="color:#1b1f4a;">${system}</strong> fue procesado correctamente. Conserva esta información para iniciar sesión.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f4f8fb;border:1px solid #cddbe6;border-radius:14px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="margin:0;color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.08em;line-height:1.3;text-transform:uppercase;">Cuenta de acceso</div>
                      <div style="margin-top:7px;color:#1b1f4a;font-size:23px;font-weight:800;letter-spacing:0.02em;line-height:1.25;word-break:break-word;">${account}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff8e9;border:1px solid #ead7a7;border-radius:14px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="margin:0;color:#8a641d;font-size:10px;font-weight:700;letter-spacing:0.08em;line-height:1.3;text-transform:uppercase;">Contraseña temporal</div>
                      <div style="margin-top:7px;color:#1b1f4a;font-size:23px;font-weight:800;letter-spacing:0.04em;line-height:1.25;word-break:break-word;">${temporaryPassword}</div>
                      <div style="margin-top:7px;color:#76531b;font-size:12px;line-height:1.5;">Utilízala en tu primer acceso y cámbiala cuando el sistema lo solicite. No la compartas.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;">
                <p style="margin:0;color:#1b1f4a;font-size:15px;font-weight:800;line-height:1.4;">Cómo ingresar a SIAU</p>
                <p style="margin:7px 0 0;color:#4f6076;font-size:14px;line-height:1.55;">Escribe tu cuenta y la contraseña temporal indicada arriba. Tus medios de contacto registrados seguirán disponibles para los mecanismos de verificación del sistema.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;height:100%;border:1px solid #d5e0ea;border-radius:12px;">
                        <tr>
                          <td style="padding:15px;">
                            <div style="color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.07em;line-height:1.3;text-transform:uppercase;">Telegram</div>
                            <div style="margin-top:7px;color:#1b1f4a;font-size:15px;font-weight:800;line-height:1.35;">${phone}</div>
                            <div style="margin-top:5px;color:#62748e;font-size:12px;line-height:1.45;">Ingresa este número para recibir el código por Telegram.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;height:100%;border:1px solid #d5e0ea;border-radius:12px;">
                        <tr>
                          <td style="padding:15px;">
                            <div style="color:#8494a8;font-size:10px;font-weight:700;letter-spacing:0.07em;line-height:1.3;text-transform:uppercase;">Correo electrónico</div>
                            <div style="margin-top:7px;color:#1b1f4a;font-size:14px;font-weight:800;line-height:1.35;word-break:break-word;">${email}</div>
                            <div style="margin-top:5px;color:#62748e;font-size:12px;line-height:1.45;">También puedes recibir el código en este correo.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff8e9;border-left:4px solid #b9811f;border-radius:8px;">
                  <tr>
                    <td style="padding:13px 15px;color:#76531b;font-size:12px;line-height:1.55;"><strong>Importante:</strong> SIAU nunca solicitará tu código de verificación por llamada, mensaje o correo. No lo compartas con nadie.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 30px;">
                <p style="margin:0;color:#62748e;font-size:12px;line-height:1.55;">Si no reconoces este registro o necesitas apoyo, comunícate con la mesa de ayuda institucional.</p>
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

function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 10);

    if (digits.length !== 10) {
        return digits || 'No registrado';
    }

    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
}

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}