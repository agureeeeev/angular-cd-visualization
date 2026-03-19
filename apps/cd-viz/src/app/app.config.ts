import {
    ApplicationConfig,
    provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { NG_EVENT_PLUGINS } from '@taiga-ui/event-plugins';
import { appRoutes } from './app.routes';

/**
 * Провайдеры уровня приложения.
 *
 * Ключевые решения:
 * 1. `provideZonelessChangeDetection` — полностью убирает Zone.js;
 *    Angular планирует CD реактивно через Signals и явные вызовы markForCheck.
 * 2. `NG_EVENT_PLUGINS` — необходим Taiga UI для эффективной обработки событий
 *    (особенно `(click.stop)` и аналогичных декораторов).
 * 3. `provideAnimations` — движок анимаций Taiga UI.
 */
export const appConfig: ApplicationConfig = {
    providers: [
        provideZonelessChangeDetection(),
        provideAnimations(),
        provideRouter(appRoutes),
        NG_EVENT_PLUGINS,
    ],
};
