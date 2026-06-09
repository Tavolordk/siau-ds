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

interface ClusterZone {
    x: number;
    y: number;
    spreadX: number;
    spreadY: number;
    nodes: number;
}

const PARTICLE_COLOR = '255, 255, 255';
const LINK_DISTANCE = 168;
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
     * Multiplicador global de velocidad.
     * 1.0 es el valor recomendado para parecerse al Figma.
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

        this.particles = this.createRandomFigmaLikeParticles(width, height);
        this.edges = this.createEdges(this.particles);
        this.runners = this.createRunners(this.edges);

        this.drawFrame();
    }

    /**
     * Figura random en cada refresh, pero con distribución parecida al Figma:
     * grupos grandes en bordes y zonas laterales, dejando más limpio el centro
     * donde van el logo y el formulario.
     */
    private createRandomFigmaLikeParticles(width: number, height: number): AuthParticle[] {
        const particles: AuthParticle[] = [];
        const minSide = Math.min(width, height);

        const zones: ClusterZone[] = [
            { x: -0.02, y: 0.11, spreadX: 0.18, spreadY: 0.2, nodes: this.randomInt(5, 8) },
            { x: 0.18, y: 0.58, spreadX: 0.18, spreadY: 0.28, nodes: this.randomInt(7, 11) },
            { x: 0.28, y: 0.16, spreadX: 0.2, spreadY: 0.18, nodes: this.randomInt(5, 9) },
            { x: 0.7, y: 0.22, spreadX: 0.2, spreadY: 0.22, nodes: this.randomInt(8, 13) },
            { x: 0.9, y: 0.12, spreadX: 0.16, spreadY: 0.18, nodes: this.randomInt(5, 9) },
            { x: 0.68, y: 0.72, spreadX: 0.25, spreadY: 0.22, nodes: this.randomInt(11, 17) },
            { x: 0.88, y: 0.7, spreadX: 0.16, spreadY: 0.2, nodes: this.randomInt(7, 11) },
            { x: 0.02, y: 0.84, spreadX: 0.18, spreadY: 0.22, nodes: this.randomInt(5, 9) },
        ];

        for (const zone of zones) {
            const centerX = width * zone.x + this.random(-width * 0.035, width * 0.035);
            const centerY = height * zone.y + this.random(-height * 0.035, height * 0.035);
            const spreadX = width * zone.spreadX;
            const spreadY = height * zone.spreadY;

            for (let index = 0; index < zone.nodes; index += 1) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.sqrt(Math.random());
                const x = centerX + Math.cos(angle) * spreadX * distance;
                const y = centerY + Math.sin(angle) * spreadY * distance;

                particles.push(this.createParticle(x, y, index));
            }
        }

        /**
         * Puntos sueltos para líneas largas y nodos aislados como en el video.
         * Evitamos demasiado el centro para no ensuciar el formulario.
         */
        const looseCount = Math.min(34, Math.max(14, Math.floor(minSide / 24)));

        for (let index = 0; index < looseCount; index += 1) {
            const { x, y } = this.randomLoosePoint(width, height);
            particles.push(this.createParticle(x, y, index, true));
        }

        return particles;
    }

    private createParticle(x: number, y: number, index: number, loose = false): AuthParticle {
        return {
            x,
            y,
            baseX: x,
            baseY: y,
            radius: Math.random() > (loose ? 0.9 : 0.82) ? 2.05 : 1.22,
            alpha: loose ? 0.32 + Math.random() * 0.22 : 0.42 + Math.random() * 0.34,
            phase: index * 0.73 + Math.random() * Math.PI * 2,
        };
    }

    private randomLoosePoint(width: number, height: number): { x: number; y: number } {
        for (let attempt = 0; attempt < 16; attempt += 1) {
            const x = Math.random() * width;
            const y = Math.random() * height;

            const inCentralCardArea = x > width * 0.32 && x < width * 0.68 && y > height * 0.18 && y < height * 0.92;
            const inLogoArea = x > width * 0.32 && x < width * 0.68 && y < height * 0.25;

            if (!inCentralCardArea && !inLogoArea) {
                return { x, y };
            }
        }

        return {
            x: Math.random() > 0.5 ? Math.random() * width * 0.25 : width * (0.75 + Math.random() * 0.25),
            y: Math.random() * height,
        };
    }

    /**
     * Red fija calculada al cargar. Los runners viajan sobre estas líneas.
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

                const keepProbability = distance < 78 ? 0.66 : 0.36;

                if (Math.random() > keepProbability) {
                    continue;
                }

                edges.push({ from: i, to: j, distance });
            }
        }

        return edges.length < 32 ? this.createFallbackEdges(particles) : edges;
    }

    private createFallbackEdges(particles: AuthParticle[]): AuthEdge[] {
        const edgeKeys = new Set<string>();
        const edges: AuthEdge[] = [];

        for (let i = 0; i < particles.length; i += 1) {
            const nearest = particles
                .map((particle, index) => ({
                    index,
                    distance:
                        index === i
                            ? Number.POSITIVE_INFINITY
                            : Math.hypot(particles[i].baseX - particle.baseX, particles[i].baseY - particle.baseY),
                }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3);

            for (const candidate of nearest) {
                const from = Math.min(i, candidate.index);
                const to = Math.max(i, candidate.index);
                const key = `${from}-${to}`;

                if (edgeKeys.has(key)) {
                    continue;
                }

                edgeKeys.add(key);
                edges.push({ from, to, distance: candidate.distance });
            }
        }

        return edges;
    }

    private createRunners(edges: AuthEdge[]): AuthRunner[] {
        if (!edges.length) {
            return [];
        }

        const runnerCount = Math.min(36, Math.max(16, Math.floor(edges.length / 7)));

        return Array.from({ length: runnerCount }, () => ({
            edgeIndex: Math.floor(Math.random() * edges.length),
            progress: Math.random(),
            speed: 0.0025 + Math.random() * 0.004,
            direction: Math.random() > 0.5 ? 1 : -1,
            radius: 1.25 + Math.random() * 0.55,
            alpha: 0.64 + Math.random() * 0.26,
            trail: 0.07 + Math.random() * 0.08,
        }));
    }

    private step(deltaFactor: number): void {
        this.stepBaseNodes();
        this.stepRunners(deltaFactor);
    }

    private stepBaseNodes(): void {
        for (const particle of this.particles) {
            particle.x = particle.baseX + Math.sin(this.elapsed * 0.18 + particle.phase) * 1.35;
            particle.y = particle.baseY + Math.cos(this.elapsed * 0.16 + particle.phase) * 1.35;
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
                runner.speed = 0.0025 + Math.random() * 0.004;
                runner.trail = 0.07 + Math.random() * 0.08;
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

        return candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : Math.floor(Math.random() * this.edges.length);
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
            const distance = Math.hypot(first.x - second.x, first.y - second.y);
            const opacity = Math.max(0, (1 - distance / LINK_DISTANCE) * 0.2);

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
            context.strokeStyle = `rgba(${PARTICLE_COLOR}, ${runner.alpha * 0.5})`;
            context.lineWidth = 1.6;
            context.stroke();

            context.beginPath();
            context.arc(head.x, head.y, runner.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, ${runner.alpha})`;
            context.fill();

            context.beginPath();
            context.arc(head.x, head.y, runner.radius * 3.8, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, 0.045)`;
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

            const opacity = (1 - distance / MOUSE_DISTANCE) * 0.28;

            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(mouse.x, mouse.y);
            context.strokeStyle = `rgba(${PARTICLE_COLOR}, ${opacity})`;
            context.stroke();
        }
    }

    private drawParticles(context: CanvasRenderingContext2D): void {
        for (const particle of this.particles) {
            const pulse = 0.84 + Math.sin(this.elapsed * 0.75 + particle.phase) * 0.07;
            const alpha = particle.alpha * pulse;

            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(${PARTICLE_COLOR}, ${alpha})`;
            context.fill();
        }
    }

    private random(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(this.random(min, max + 1));
    }
}