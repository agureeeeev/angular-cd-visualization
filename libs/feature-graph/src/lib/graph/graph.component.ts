import {
    ChangeDetectionStrategy,
    Component,
    OnDestroy,
    afterNextRender,
    effect,
    inject,
    signal,
    viewChild,
    ElementRef,
    DestroyRef,
    untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import cytoscape, { Core, NodeDefinition, EdgeDefinition, StylesheetStyle } from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';
import { CdEvent, CdStrategy, CdTrackerService } from '@cd-viz/data-access';

cytoscape.use(cytoscapeDagre);

// ─── Статическое определение графа ───────────────────────────────────────────

const INITIAL_NODES: NodeDefinition[] = [
    { data: { id: 'app', label: 'AppComponent', strategy: 'Default' } },
    { data: { id: 'graph1', label: 'GraphComponent 1', strategy: 'Default' } },
    { data: { id: 'graph2', label: 'GraphComponent 2', strategy: 'Default' } },
    { data: { id: 'panel', label: 'ControlPanel', strategy: 'Default' } },
    { data: { id: 'node-a', label: 'Node A', strategy: 'Default' } },
    { data: { id: 'node-a-1', label: 'Node A.1', strategy: 'Default' } },
    { data: { id: 'node-a-2', label: 'Node A.2', strategy: 'OnPush' } },
    { data: { id: 'node-b', label: 'Node B', strategy: 'OnPush' } },
    { data: { id: 'node-b-1', label: 'Node B.1', strategy: 'Default' } },
    { data: { id: 'node-b-1-1', label: 'Node B.1.1', strategy: 'Default' } },
    { data: { id: 'node-b-2', label: 'Node B.2', strategy: 'OnPush' } },
    { data: { id: 'node-b-2-1', label: 'Node B.2.1', strategy: 'Default' } },
    { data: { id: 'node-c', label: 'Node C', strategy: 'Default' } },
    { data: { id: 'node-c-1', label: 'Node C.1', strategy: 'OnPush' } },
    { data: { id: 'node-c-2', label: 'Node C.2', strategy: 'Default' } },

    // Graph 2 Nodes
    { data: { id: 'node2-a', label: 'Node 2.A', strategy: 'Default' } },
    { data: { id: 'node2-b', label: 'Node 2.B', strategy: 'OnPush' } },
    { data: { id: 'node2-c', label: 'Node 2.C', strategy: 'Default' } },
];

const INITIAL_EDGES: EdgeDefinition[] = [
    { data: { id: 'e1', source: 'app', target: 'graph1' } },
    { data: { id: 'e_g2', source: 'app', target: 'graph2' } },
    { data: { id: 'e2', source: 'app', target: 'panel' } },
    { data: { id: 'e3', source: 'graph1', target: 'node-a' } },
    { data: { id: 'e4', source: 'graph1', target: 'node-b' } },
    { data: { id: 'e5', source: 'graph1', target: 'node-c' } },
    { data: { id: 'e6', source: 'node-b', target: 'node-b-1' } },
    { data: { id: 'e7', source: 'node-b', target: 'node-b-2' } },
    { data: { id: 'e8', source: 'node-a', target: 'node-a-1' } },
    { data: { id: 'e9', source: 'node-a', target: 'node-a-2' } },
    { data: { id: 'e10', source: 'node-b-1', target: 'node-b-1-1' } },
    { data: { id: 'e11', source: 'node-b-2', target: 'node-b-2-1' } },
    { data: { id: 'e12', source: 'node-c', target: 'node-c-1' } },
    { data: { id: 'e13', source: 'node-c', target: 'node-c-2' } },

    { data: { id: 'e2-3', source: 'graph2', target: 'node2-a' } },
    { data: { id: 'e2-4', source: 'graph2', target: 'node2-b' } },
    { data: { id: 'e2-5', source: 'graph2', target: 'node2-c' } },
];

const CY_STYLES: StylesheetStyle[] = [
    {
        selector: 'node',
        style: {
            'background-color': '#3b82f6',
            'border-width': 2,
            'border-color': '#1d4ed8',
            label: 'data(label)',
            color: '#fff',
            'font-size': '11px',
            'font-family': 'Roboto, sans-serif',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 130,
            height: 44,
            shape: 'round-rectangle',
        },
    },
    {
        // Ноды с OnPush отображаются другим цветом в состоянии покоя
        selector: 'node[strategy = "OnPush"]',
        style: { 'background-color': '#7c3aed', 'border-color': '#5b21b6' },
    },
    {
        selector: 'node.highlighted',
        style: {
            'background-color': '#22c55e',
            'border-color': '#15803d',
            'transition-property': 'background-color, border-color',
            'transition-duration': '200ms',
        } as Record<string, unknown>,
    },
    {
        selector: 'node.stale',
        style: {
            'background-color': '#ef4444',
            'border-color': '#b91c1c',
            'transition-property': 'background-color, border-color',
            'transition-duration': '200ms',
        } as Record<string, unknown>,
    },
    {
        selector: 'edge',
        style: {
            width: 2,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
        },
    },
    {
        selector: '.hidden',
        style: {
            display: 'none',
        } as Record<string, unknown>,
    },
];

// ─── Компонент ───────────────────────────────────────────────────────────────

/**
 * `GraphComponent` — тонкая Angular-обёртка над экземпляром Cytoscape.js.
 *
 * Жизненный цикл:
 * 1. `afterNextRender` → инициализирует Cytoscape после первого рендера в DOM.
 * 2. `effect()` реагирует на `CdTrackerService.lastEvent` → вызывает `highlightNode`.
 *
 * Всё взаимодействие с DOM происходит через API Cytoscape, поэтому компонент
 * никогда не касается конвейера рендеринга Angular после первой отрисовки.
 */
@Component({
    selector: 'cd-graph',
    standalone: true,
    templateUrl: './graph.component.html',
    styleUrl: './graph.component.scss',
})
export class GraphComponent implements OnDestroy {
    private readonly tracker = inject(CdTrackerService);
    private readonly destroyRef = inject(DestroyRef);
    private cy: Core | null = null;
    private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /** Ссылка на шаблонный элемент — точка монтирования Cytoscape */
    readonly cyContainer = viewChild.required<ElementRef<HTMLDivElement>>('cyContainer');

    /** Флаг: был ли Cytoscape уже инициализирован */
    readonly ready = signal(false);

    constructor() {
        // Инициализируем Cytoscape после первого рендера (только в браузере)
        afterNextRender(() => {
            this.initCytoscape();
        });

        // Реагируем на каждый новый CD-евент и подсвечиваем соответствующую ноду
        effect(() => {
            const event = this.tracker.lastEvent();
            if (event && this.ready()) {
                this.highlightNode(event);
            }
        });

        this.tracker.strategyChanges$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ nodeId, strategy }) => {
                this.setNodeStrategy(nodeId, strategy);
            });

        this.tracker.visibilityChanges$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ nodeId, isVisible }) => {
                this.setNodeVisibility(nodeId, isVisible);
            });
    }

    // ── Публичное API (вызывается родителем / тестами) ───────────────────────────

    /** Обновляет метку стратегии на ноде и переприменяет визуальные классы */
    setNodeStrategy(nodeId: string, strategy: CdStrategy): void {
        if (!this.cy) return;
        const node = this.cy.$(`#${nodeId}`);
        node.data('strategy', strategy);
        if (strategy === 'OnPush') {
            node.addClass('onpush');
        } else {
            node.removeClass('onpush');
        }
    }

    setNodeVisibility(nodeId: string, isVisible: boolean): void {
        if (!this.cy) return;
        const node = this.cy.$(`#${nodeId}`);
        const successors = node.successors(); // Gets descendants and edges

        if (isVisible) {
            successors.removeClass('hidden');
        } else {
            successors.addClass('hidden');
        }
    }

    // ── Приватные вспомогательные методы ─────────────────────────────────────────

    private initCytoscape(): void {
        this.cy = cytoscape({
            container: this.cyContainer().nativeElement,
            elements: {
                nodes: INITIAL_NODES,
                edges: INITIAL_EDGES,
            },
            style: CY_STYLES,
            layout: {
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 40,
                rankSep: 60,
                padding: 30,
                fit: true,
            } as cytoscape.LayoutOptions,
            userZoomingEnabled: true,
            userPanningEnabled: true,
            minZoom: 0.4,
            maxZoom: 2.5,
        });

        this.ready.set(true);
    }

    private highlightNode(event: CdEvent): void {
        if (!this.cy) return;

        const node = this.cy.$(`#${event.nodeId}`);
        if (!node || node.length === 0) return;

        // Отменяем предыдущую подсветку, если она ещё не завершилась
        const existing = this.flashTimers.get(event.nodeId);
        if (existing) clearTimeout(existing);

        node.removeClass('stale').addClass('highlighted');

        const timer = setTimeout(() => {
            node.removeClass('highlighted').addClass('stale');

            // Плавное возвращение к базовому цвету после второй задержки
            const fadeTimer = setTimeout(() => {
                node.removeClass('stale');
                this.flashTimers.delete(event.nodeId);
            }, 600);

            this.flashTimers.set(`${event.nodeId}_fade`, fadeTimer);
        }, 800);

        this.flashTimers.set(event.nodeId, timer);
    }

    ngOnDestroy(): void {
        this.flashTimers.forEach(t => clearTimeout(t));
        this.cy?.destroy();
        this.cy = null;
    }

    protected trackRender(): string {
        if (!this.tracker.startTrackingNode('graph1')) return '';
        Promise.resolve().then(() => {
            untracked(() => {
                this.tracker.push({
                    nodeId: 'graph1',
                    label: 'GraphComponent 1',
                    strategy: 'Default',
                    trigger: 'render',
                });
            });
        });
        return '';
    }
}
