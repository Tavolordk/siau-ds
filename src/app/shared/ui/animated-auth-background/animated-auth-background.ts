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
const LINK_DISTANCE = 155;
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

        this.particles = this.createRandomClusteredParticles(width, height);
        this.edges = this.createEdges(this.particles);
        this.runners = this.createRunners(this.edges);

        this.drawFrame();
    }

    /**
     * Figura random en cada refresh.
     * No es una nube uniforme; son clusters aleatorios para que se parezca más
     * al fondo de Figma: grupos de nodos conectados en distintas zonas.
     */
    private createRandomClusteredParticles(width: number, height: number): AuthParticle[] {
        const particles: AuthParticle[] = [];

        const clusterCount = width < 720 ? 7 : 11;
        const minSide = Math.min(width, height);

        for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
            const centerX = Math.random() * width;
            const centerY = Math.random() * height;

            const clusterRadius = minSide * (0.12 + Math.random() * 0.13);
            const nodeCount = 8 + Math.floor(Math.random() * 9);

            for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
                const angle = Math.random() * Math.PI * 2;
                const distance = clusterRadius * Math.sqrt(Math.random());

                const x = centerX + Math.cos(angle) * distance;
                const y = centerY + Math.sin(angle) * distance;

                particles.push({
                    x,
                    y,
                    baseX: x,
                    baseY: y,
                    radius: Math.random() > 0.82 ? 2.15 : 1.35,
                    alpha: 0.48 + Math.random() * 0.32,
                    phase: Math.random() * Math.PI * 2,
                });
            }
        }

        /**
         * Nodos sueltos para que la red no se vea como “bolitas separadas”;
         * estos ayudan a formar líneas largas y cruces como en el video.
         */
        const looseCount = Math.min(42, Math.max(18, Math.floor(width / 38)));

        for (let index = 0; index < looseCount; index += 1) {
            const x = Math.random() * width;
            const y = Math.random() * height;

            particles.push({
                x,
                y,
                baseX: x,
                baseY: y,
                radius: Math.random() > 0.88 ? 2 : 1.15,
                alpha: 0.38 + Math.random() * 0.24,
                phase: Math.random() * Math.PI * 2,
            });
        }

        return particles;
    }

    /**
     * Red fija calculada al cargar.
     * Los runners viajan sobre estas líneas.
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

                /**
                 * Reduce conexiones excesivas para que no se vea como telaraña sólida.
                 */
                const keepProbability = distance < 80 ? 0.68 : 0.42;

                if (Math.random() > keepProbability) {
                    continue;
                }

                edges.push({
                    from: i,
                    to: j,
                    distance,
                });
            }
        }

        /**
         * Si por azar queda con pocas líneas, abre un poco la red.
         */
        if (edges.length < 40) {
            return this.createFallbackEdges(particles);
        }

        return edges;
    }

    private createFallbackEdges(particles: AuthParticle[]): AuthEdge[] {
        const edges: AuthEdge[] = [];

        for (let i = 0; i < particles.length; i += 1) {
            const distances = particles
                .map((particle, index) => ({
                    index,
                    distance: index === i ? Number.POSITIVE_INFINITY : Math.hypot(
                        particles[i].baseX - particle.baseX,
                        particles[i].baseY - particle.baseY,
                    ),
                }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3);

            for (const candidate of distances) {
                if (candidate.index <= i) {
                    continue;
                }

                edges.push({
                    from: i,
                    to: candidate.index,
                    distance: candidate.distance,
                });
            }
        }

        return edges;
    }

    private createRunners(edges: AuthEdge[]): AuthRunner[] {
        if (!edges.length) {
            return [];
        }

        const runnerCount = Math.min(46, Math.max(20, Math.floor(edges.length / 8)));

        return Array.from({ length: runnerCount }, () => ({
            edgeIndex: Math.floor(Math.random() * edges.length),
            progress: Math.random(),
            speed: 0.0026 + Math.random() * 0.0042,
            direction: Math.random() > 0.5 ? 1 : -1,
            radius: 1.45 + Math.random() * 0.7,
            alpha: 0.72 + Math.random() * 0.25,
            trail: 0.08 + Math.random() * 0.08,
        }));
    }

    private step(deltaFactor: number): void {
        this.stepBaseNodes();
        this.stepRunners(deltaFactor);
    }

    private stepBaseNodes(): void {
        for (const particle of this.particles) {
            particle.x = particle.baseX + Math.sin(this.elapsed * 0.22 + particle.phase) * 1.8;
            particle.y = particle.baseY + Math.cos(this.elapsed * 0.2 + particle.phase) * 1.8;
        }
    }

    private stepRunners(deltaFactor: number): void {
        if (!this.edges.length) {
            return;
        }

        for (const runner of this.runners) {
            runner.progress += runner.speed * runner.direction * deltaFactor;

            if (runner.progress > 1 || runner.progress < 0) {
                const currentEdge = this.edges[runner.edgeIndex];
                const exitNode = runner.direction === 1 ? currentEdge.to : currentEdge.from;
                const nextEdgeIndex = this.pickNextEdgeIndex(exitNode, runner.edgeIndex);

                runner.edgeIndex = nextEdgeIndex;
                runner.direction = this.edges[nextEdgeIndex].from === exitNode ? 1 : -1;
                runner.progress = runner.direction === 1 ? 0 : 1;
                runner.speed = 0.0026 + Math.random() * 0.0042;
                runner.trail = 0.08 + Math.random() * 0.08;
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

            const opacity = Math.max(0, (1 - distance / LINK_DISTANCE) * 0.23);

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

            const trailStart = this.interpolatePoint(from, to, startProgress);
            const trailEnd = this.interpolatePoint(from, to, runner.progress);
            const head = this.interpolatePoint(from, to, runner.progress);

            context.beginPath();
            context.moveTo(trailStart.x, trailStart.y);
            context.lineTo(trailEnd.x, trailEnd.y);
            context.strokeStyle = `rgba(${PARTICLE_COLOR}, ${runner.alpha * 0.58})`;
            context.lineWidth = 1.7;
            context.stroke();

            context.beginPath();
            context.arc(head.x, head.y, runner.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, ${runner.alpha})`;
            context.fill();

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