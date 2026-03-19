import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type EventTrigger = 'dom' | 'promise' | 'signal' | 'render' | 'bootstrap';
export type CdStrategy = 'Default' | 'OnPush';

export interface CdEvent {
  nodeId: string;
  label: string;
  strategy: CdStrategy;
  trigger: EventTrigger;
  timestamp: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Центральная шина событий для телеметрии Change Detection.
 *
 * - `push()` добавляет событие в буфер очереди `_queue`.
 * - Таймер с дрейном вытаскивает очередь по одному событию за раз (REVEAL_INTERVAL мс),
 *   добавляя каждое в `_visibleEvents` — сигнал для живого лога.
 * - `lastEvent` отражает последнее показанное событие (запускает подсветку в графе).
 * - `events` — только количество всех событий (для бейджа).
 */
@Injectable({ providedIn: 'root' })
export class CdTrackerService {
  private static readonly REVEAL_INTERVAL = 750; // ms between each revealed event
  private static readonly MAX_VISIBLE = 30;       // keep at most this many in the log

  private readonly _allEvents = signal<CdEvent[]>([]);
  private readonly _visibleEvents = signal<CdEvent[]>([]);

  private _suppressing = false;
  private _queue: CdEvent[] = [];
  private _drainTimer: ReturnType<typeof setInterval> | null = null;

  /** Общее количество событий — используется только для бейджа-счётчика */
  readonly events = this._allEvents.asReadonly();

  /** События, отображаемые в логе, появляющиеся по одному */
  readonly visibleEvents = this._visibleEvents.asReadonly();

  /** Последнее показанное событие (запускает подсветку ноды в графе) */
  readonly lastEvent = computed<CdEvent | null>(() => {
    const evts = this._visibleEvents();
    return evts.length > 0 ? evts[evts.length - 1] : null;
  });

  readonly strategyChanges$ = new Subject<{ nodeId: string, strategy: CdStrategy }>();
  readonly visibilityChanges$ = new Subject<{ nodeId: string, isVisible: boolean }>();

  // ── Публичное API ──────────────────────────────────────────────────────────

  currentTrigger: EventTrigger | null = null;
  private _isTrackingActive = false;
  get isTrackingActive(): boolean { return this._isTrackingActive; }
  private _trackedThisCycle = new Set<string>();

  startCycle(trigger: EventTrigger): void {
    this.currentTrigger = trigger;
    this._isTrackingActive = true;
    this._trackedThisCycle.clear();
    setTimeout(() => {
      this._isTrackingActive = false;
      this.currentTrigger = null;
      this._trackedThisCycle.clear();
    });
  }

  startTrackingNode(nodeId: string): boolean {
    if (!this._isTrackingActive) return false;
    if (this._trackedThisCycle.has(nodeId)) return false;
    this._trackedThisCycle.add(nodeId);
    return true;
  }

  push(event: Omit<CdEvent, 'timestamp' | 'trigger'> & { trigger?: EventTrigger }): void {
    if (this._suppressing || !this._isTrackingActive) return;

    const fullEvent: CdEvent = {
      ...event,
      trigger: event.trigger ?? this.currentTrigger ?? 'render',
      timestamp: Date.now()
    };

    // Добавляем в рав хисторию сразу (для счётчика бейджа)
    this._allEvents.update(evts => [...evts.slice(-199), fullEvent]);

    // Помещаем в очередь для постепенного визуального отображения
    this._queue.push(fullEvent);
    this._startDrain();
  }

  notifyStrategyChange(nodeId: string, strategy: CdStrategy): void {
    this.strategyChanges$.next({ nodeId, strategy });
  }

  notifyVisibilityChange(nodeId: string, isVisible: boolean): void {
    this.visibilityChanges$.next({ nodeId, isVisible });
  }

  clear(): void {
    this._suppressing = true;
    this._queue = [];
    this._stopDrain();
    this._allEvents.set([]);
    this._visibleEvents.set([]);

    setTimeout(() => {
      this._suppressing = false;
    }, 50);
  }

  // ── Приватные вспомогательные методы ──────────────────────────────────────────

  private _startDrain(): void {
    if (this._drainTimer !== null) return;
    this._drainTimer = setInterval(() => {
      if (this._queue.length === 0) {
        this._stopDrain();
        return;
      }
      const next = this._queue.shift()!;
      this._visibleEvents.update(evts => [
        ...evts.slice(-(CdTrackerService.MAX_VISIBLE - 1)),
        next,
      ]);
    }, CdTrackerService.REVEAL_INTERVAL);
  }

  private _stopDrain(): void {
    if (this._drainTimer !== null) {
      clearInterval(this._drainTimer);
      this._drainTimer = null;
    }
  }
}
