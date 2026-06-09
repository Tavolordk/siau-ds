import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Input,
    NgZone,
    OnDestroy,
    ViewChild,
    inject,
} from '@angular/core';

interface AuthParticle {
    x: number;
    y: number;
    baseX: number;
    baseY: number;
    radius: number;
    alpha: number;
    phase: number;
}

interface AuthEdge {
    from: number;
    to: number;
    distance: number;
}

interface AuthRunner {
    edgeIndex: number;
    progress: number;
    speed: number;
    direction: 1 | -1;
    radius: number;
    alpha: number;
    trail: number;
}

const PARTICLE_COLOR = '255, 255, 255';
const LINK_DISTANCE = 160;
const MOUSE_DISTANCE = 200;
const BASE_FRAME_MS = 1000 / 60;

@Component({
    selector: 'siau-animated-auth-background',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './animated-auth-background.html',
    styleUrl: './animated-auth-background.scss',
})
export class AnimatedAuthBackground implements AfterViewInit, OnDestroy {
    @Input() interactive = true;

    /**
     * Multiplicador global.
     * Recomendado: 1.
     * Si quieres que los puntos corran más rápido: 1.3 o 1.5.
     */
    @Input() speed = 1;

    @ViewChild('canvas', { static: true })
    private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly zone = inject(NgZone);

    private context: CanvasRenderingContext2D | null = null;
    private particles: AuthParticle[] = [];
    private edges: AuthEdge[] = [];
    private runners: AuthRunner[] = [];

    private width = 0;
    private height = 0;
    private animationFrameId = 0;
    private lastTime = 0;
    private elapsed = 0;

    private mouse: { x: number; y: number } | null = null;
    private reducedMotion = false;
    private resizeObserver: ResizeObserver | null = null;
    private removeListeners: (() => void) | null = null;

    ngAfterViewInit(): void {
        this.context = this.canvasRef.nativeElement.getContext('2d');

        if (!this.context || typeof window === 'undefined') {
            return;
        }

        this.reducedMotion =
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

        this.zone.runOutsideAngular(() => {
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(() => this.resize());
                this.resizeObserver.observe(this.host.nativeElement);
            }

            const onWindowResize = () => this.resize();
            window.addEventListener('resize', onWindowResize, { passive: true });

            let onMove: ((event: PointerEvent) => void) | null = null;
            let onLeave: (() => void) | null = null;

            if (this.interactive) {
                onMove = (event: PointerEvent) => {
                    const rect = this.host.nativeElement.getBoundingClientRect();
                    this.mouse = {
                        x: event.clientX - rect.left,
                        y: event.clientY - rect.top,
                    };
                };

                onLeave = () => {
                    this.mouse = null;
                };

                window.addEventListener('pointermove', onMove, { passive: true });
                window.addEventListener('pointerleave', onLeave, { passive: true });
            }

            this.removeListeners = () => {
                window.removeEventListener('resize', onWindowResize);
                if (onMove) window.removeEventListener('pointermove', onMove);
                if (onLeave) window.removeEventListener('pointerleave', onLeave);
            };

            this.resize();

            if (this.reducedMotion) {
                this.drawFrame();
                return;
            }

            const loop = (time: number) => {
                const delta = this.lastTime ? Math.min(time - this.lastTime, 100) : BASE_FRAME_MS;
                this.lastTime = time;

                const deltaFactor = (delta / BASE_FRAME_MS) * this.speed;
                this.elapsed += delta / 1000;

                this.step(deltaFactor);
                this.drawFrame();

                this.animationFrameId = requestAnimationFrame(loop);
            };

            this.animationFrameId = requestAnimationFrame(loop);
        });
    }

    ngOnDestroy(): void {
        cancelAnimationFrame(this.animationFrameId);
        this.resizeObserver?.disconnect();
        this.removeListeners?.();
    }

    private resize(): void {
        const canvas = this.canvasRef.nativeElement;
        const context = this.context;

        if (!context) {
            return;
        }

        const rect = this.host.nativeElement.getBoundingClientRect();
        const width = rect.width || window.innerWidth;
        const height = rect.height || window.innerHeight;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        this.width = width;
        this.height = height;

        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        this.particles = this.createParticles(width, height);
        this.edges = this.createEdges(this.particles);
        this.runners = this.createRunners(this.edges);

        this.drawFrame();
    }

    private createParticles(width: number, height: number): AuthParticle[] {
        const count = Math.min(170, Math.max(72, Math.floor(width / 11.5)));

        return Array.from({ length: count }, (_, index) => {
            const x = Math.random() * width;
            const y = Math.random() * height;

            return {
                x,
                y,
                baseX: x,
                baseY: y,
                radius: Math.random() > 0.82 ? 2.15 : 1.35,
                alpha: 0.55 + Math.random() * 0.28,
                phase: index * 0.73 + Math.random() * Math.PI * 2,
            };
        });
    }

    /**
     * Aquí se fija la red.
     * La red NO cambia de forma en cada frame.
     * Esto permite que los runners viajen sobre líneas reales.
     */
    private createEdges(particles: AuthParticle[]): AuthEdge[] {
        const edges: AuthEdge[] = [];

        for (let i = 0; i < particles.length; i += 1) {
            const first = particles[i];

            for (let j = i + 1; j < particles.length; j += 1) {
                const second = particles[j];

                const dx = first.baseX - second.baseX;
                const dy = first.baseY - second.baseY;

                if (Math.abs(dx) > LINK_DISTANCE || Math.abs(dy) > LINK_DISTANCE) {
                    continue;
                }

                const distance = Math.hypot(dx, dy);

                if (distance > LINK_DISTANCE) {
                    continue;
                }

                edges.push({
                    from: i,
                    to: j,
                    distance,
                });
            }
        }

        return edges;
    }

    private createRunners(edges: AuthEdge[]): AuthRunner[] {
        const runnerCount = Math.min(42, Math.max(18, Math.floor(edges.length / 22)));

        return Array.from({ length: runnerCount }, () => ({
            edgeIndex: Math.floor(Math.random() * edges.length),
            progress: Math.random(),
            /**
             * Este es el movimiento que faltaba:
             * progreso sobre la línea.
             * Más alto = corre más rápido.
             */
            speed: 0.0024 + Math.random() * 0.0038,
            direction: Math.random() > 0.5 ? 1 : -1,
            radius: 1.55 + Math.random() * 0.75,
            alpha: 0.72 + Math.random() * 0.25,
            trail: 0.07 + Math.random() * 0.07,
        }));
    }

    private step(deltaFactor: number): void {
        this.stepBaseNodes();
        this.stepRunners(deltaFactor);
    }

    /**
     * Los nodos de la figura casi no se desplazan.
     * Solo respiran muy poco.
     * La figura se conserva.
     */
    private stepBaseNodes(): void {
        for (const particle of this.particles) {
            particle.x = particle.baseX + Math.sin(this.elapsed * 0.28 + particle.phase) * 2.4;
            particle.y = particle.baseY + Math.cos(this.elapsed * 0.24 + particle.phase) * 2.4;
        }
    }

    /**
     * Aquí sí se crea el efecto del video:
     * los puntos viajan SOBRE las líneas, no libres por el canvas.
     */
    private stepRunners(deltaFactor: number): void {
        if (!this.edges.length) {
            return;
        }

        for (const runner of this.runners) {
            runner.progress += runner.speed * runner.direction * deltaFactor;

            if (runner.progress > 1 || runner.progress < 0) {
                const currentEdge = this.edges[runner.edgeIndex];
                const exitNode =
                    runner.direction === 1 ? currentEdge.to : currentEdge.from;

                const nextEdgeIndex = this.pickNextEdgeIndex(exitNode, runner.edgeIndex);

                runner.edgeIndex = nextEdgeIndex;
                runner.direction = this.edges[nextEdgeIndex].from === exitNode ? 1 : -1;
                runner.progress = runner.direction === 1 ? 0 : 1;
                runner.speed = 0.0024 + Math.random() * 0.0038;
                runner.trail = 0.07 + Math.random() * 0.07;
            }
        }
    }

    private pickNextEdgeIndex(nodeIndex: number, previousEdgeIndex: number): number {
        const candidates: number[] = [];

        for (let index = 0; index < this.edges.length; index += 1) {
            if (index === previousEdgeIndex) {
                continue;
            }

            const edge = this.edges[index];

            if (edge.from === nodeIndex || edge.to === nodeIndex) {
                candidates.push(index);
            }
        }

        if (!candidates.length) {
            return Math.floor(Math.random() * this.edges.length);
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private drawFrame(): void {
        const context = this.context;

        if (!context) {
            return;
        }

        context.clearRect(0, 0, this.width, this.height);

        this.drawConnections(context);
        this.drawMouseConnections(context);
        this.drawRunners(context);
        this.drawParticles(context);
    }

    private drawConnections(context: CanvasRenderingContext2D): void {
        context.lineWidth = 1;

        for (const edge of this.edges) {
            const first = this.particles[edge.from];
            const second = this.particles[edge.to];

            const dx = first.x - second.x;
            const dy = first.y - second.y;
            const distance = Math.hypot(dx, dy);

            const opacity = Math.max(0, (1 - distance / LINK_DISTANCE) * 0.22);

            context.beginPath();
            context.moveTo(first.x, first.y);
            context.lineTo(second.x, second.y);
            context.strokeStyle = `rgba(${PARTICLE_COLOR}, ${opacity})`;
            context.stroke();
        }
    }

    private drawRunners(context: CanvasRenderingContext2D): void {
        for (const runner of this.runners) {
            const edge = this.edges[runner.edgeIndex];

            if (!edge) {
                continue;
            }

            const from = this.particles[edge.from];
            const to = this.particles[edge.to];

            const startProgress =
                runner.direction === 1
                    ? Math.max(0, runner.progress - runner.trail)
                    : Math.min(1, runner.progress + runner.trail);

            const endProgress = runner.progress;

            const trailStart = this.interpolatePoint(from, to, startProgress);
            const trailEnd = this.interpolatePoint(from, to, endProgress);

            const head = this.interpolatePoint(from, to, runner.progress);

            /**
             * Estela corta sobre la línea.
             */
            context.beginPath();
            context.moveTo(trailStart.x, trailStart.y);
            context.lineTo(trailEnd.x, trailEnd.y);
            context.strokeStyle = `rgba(${PARTICLE_COLOR}, ${runner.alpha * 0.55})`;
            context.lineWidth = 1.7;
            context.stroke();

            /**
             * Cabeza luminosa del punto viajero.
             */
            context.beginPath();
            context.arc(head.x, head.y, runner.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, ${runner.alpha})`;
            context.fill();

            /**
             * Glow suave alrededor del punto viajero.
             */
            context.beginPath();
            context.arc(head.x, head.y, runner.radius * 4.2, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, 0.055)`;
            context.fill();
        }

        context.lineWidth = 1;
    }

    private interpolatePoint(
        from: AuthParticle,
        to: AuthParticle,
        progress: number,
    ): { x: number; y: number } {
        const safeProgress = Math.max(0, Math.min(1, progress));

        return {
            x: from.x + (to.x - from.x) * safeProgress,
            y: from.y + (to.y - from.y) * safeProgress,
        };
    }

    private drawMouseConnections(context: CanvasRenderingContext2D): void {
        const mouse = this.mouse;

        if (!mouse || !this.interactive) {
            return;
        }

        context.lineWidth = 1;

        for (const particle of this.particles) {
            const distance = Math.hypot(particle.x - mouse.x, particle.y - mouse.y);

            if (distance > MOUSE_DISTANCE) {
                continue;
            }

            const opacity = (1 - distance / MOUSE_DISTANCE) * 0.3;

            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(mouse.x, mouse.y);
            context.strokeStyle = `rgba(${PARTICLE_COLOR}, ${opacity})`;
            context.stroke();
        }
    }

    private drawParticles(context: CanvasRenderingContext2D): void {
        for (const particle of this.particles) {
            const pulse = 0.82 + Math.sin(this.elapsed * 0.9 + particle.phase) * 0.08;
            const alpha = particle.alpha * pulse;

            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, ${alpha})`;
            context.fill();
        }
    }
}