import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CatalogosApiRepository } from './core/catalogos/data-access/catalogos-api.repository';
import { CatalogosRepository } from './core/catalogos/domain/catalogos.repository';
import { authTokenInterceptor } from './core/http/auth-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    {
      provide: CatalogosRepository,
      useClass: CatalogosApiRepository,
    },
  ],
};