import { inject, Injectable } from '@angular/core';
import { delay, map, Observable, of, throwError } from 'rxjs';
import { CorreoFacade } from '../../../../core/correo';
import {
  RequestReviewAction,
  RequestReviewCommand,
  RequestReviewNotificationResult,
} from '../../domain/models/request-review.model';

@Injectable({ providedIn: 'root' })
export class RequestReviewNotificationService {
  private readonly correoFacade = inject(CorreoFacade);

  notify(command: RequestReviewCommand): Observable<RequestReviewNotificationResult> {
    const email = command.request.applicantEmail?.trim();

    if (!email) {
      return throwError(
        () => new Error('La solicitud no tiene un correo del solicitante para enviar la notificación.'),
      );
    }

    // Los registros mock usan @siau.local para que la demo sea segura y funcional.
    // Cuando el backend entregue un correo real, se utiliza automáticamente CorreoFacade.
    if (email.endsWith('@siau.local')) {
      return of({
        accepted: true,
        message: 'Notificación simulada para el expediente de demostración.',
        correoId: `DEMO-${Date.now()}`,
      }).pipe(delay(650));
    }

    return this.correoFacade
      .send({
        to: [email],
        subject: this.subject(command.action, command.request.folio),
        body: this.body(command),
        isHtml: true,
      })
      .pipe(
        map((delivery) => ({
          accepted: delivery.accepted,
          message: delivery.message,
          correoId: delivery.correoId,
        })),
      );
  }

  private subject(action: RequestReviewAction, folio: string): string {
    const title: Record<RequestReviewAction, string> = {
      approve: 'Solicitud aprobada',
      reject: 'Solicitud rechazada',
      'request-correction': 'Corrección requerida en su solicitud',
    };

    return `SIAU 3.0 | ${title[action]} | ${folio}`;
  }

  private body(command: RequestReviewCommand): string {
    const { request, action, comment } = command;
    const actionCopy: Record<RequestReviewAction, { title: string; description: string; accent: string }> = {
      approve: {
        title: 'Solicitud aprobada',
        description: 'Su solicitud fue revisada y aprobada.',
        accent: '#1e5b4f',
      },
      reject: {
        title: 'Solicitud rechazada',
        description: 'Su solicitud fue revisada y rechazada.',
        accent: '#8c264c',
      },
      'request-correction': {
        title: 'Corrección solicitada',
        description: 'Su solicitud requiere información o ajustes antes de continuar.',
        accent: '#e96f19',
      },
    };

    const copy = actionCopy[action];

    return `
      <div style="font-family:Arial,sans-serif;background:#f2f5f7;padding:28px;color:#1b1f4a">
        <div style="max-width:640px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe6ef">
          <div style="height:4px;background:${copy.accent}"></div>
          <div style="padding:28px 32px">
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${copy.accent}">SIAU 3.0</div>
            <h2 style="margin:8px 0 10px;font-size:22px">${copy.title}</h2>
            <p style="margin:0 0 20px;color:#626582">${copy.description}</p>
            <div style="padding:14px 16px;background:#f2f5f7;border-radius:12px;margin-bottom:18px">
              <strong>Folio:</strong> ${this.escapeHtml(request.folio)}<br/>
              <strong>Tipo:</strong> ${this.escapeHtml(request.type)}
            </div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#93a3b9;margin-bottom:6px">Comentario de revisión</div>
            <div style="padding:16px;border:1px solid #dde3ea;border-radius:12px;line-height:1.6">${this.escapeHtml(comment)}</div>
            <p style="margin:22px 0 0;font-size:12px;color:#93a3b9">Mensaje generado automáticamente por el Sistema Integral de Administración de Usuarios.</p>
          </div>
        </div>
      </div>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
