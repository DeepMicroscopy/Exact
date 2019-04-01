import {BehaviorSubject} from 'rxjs';
import {Stack} from 'stack-typescript';
import {AnnotationVector} from '../../../network/types/annotation';
import {AnnotationInImage} from '../../../network/types/image';


export abstract class AnnotationMode {

    public result$: BehaviorSubject<AnnotationVector | null> = new BehaviorSubject(null);
    public visibleAnnotations: AnnotationInImage[] = [];

    protected mouseClicks: Stack<MouseEvent> = new Stack();
    protected mouseMoves: Stack<MouseEvent> = new Stack();
    protected mouseDowns: Stack<MouseEvent> = new Stack();
    protected mouseUps: Stack<MouseEvent> = new Stack();

    protected canvas: HTMLCanvasElement;
    protected ctx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Reset the current drawing as if nothing was ever drawn at all
     */
    public reset() {
        this.mouseClicks = new Stack();
        this.mouseMoves = new Stack();
        this.mouseDowns = new Stack();
        this.mouseUps = new Stack();

        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.result$.next(null);
    }

    /**
     * Handle new Events and generate a new AnnotationVector from them.
     */
    protected abstract handleEvents(): AnnotationVector | null;

    /**
     * Draw a crosshair to where the cursor is now
     *
     * @param event A MouseEvent which is needed to determine the cursors current position
     */
    protected drawCrosshair(event: MouseEvent) {
        const bounds = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / bounds.width;
        const scaleY = this.canvas.height / bounds.height;

        const thickness = 4;
        const clearingY = 16;
        const clearingX = 16;
        this.ctx.fillStyle = '#FF0000';

        // From top to mouse
        this.ctx.fillRect(
            (event.x - bounds.left) * scaleX,
            0,
            thickness,
            (event.y - bounds.top) * scaleY - clearingY
        );

        // From mouse to right
        this.ctx.fillRect(
            (event.x - bounds.left) * scaleX + clearingX,
            (event.y - bounds.top) * scaleY,
            this.canvas.width - clearingX - (event.x - bounds.left) * scaleX,
            thickness
        );

        // From mouse to bottom
        this.ctx.fillRect(
            (event.x - bounds.left) * scaleX,
            (event.y - bounds.top) * scaleY + clearingY,
            thickness,
            this.canvas.height - clearingY - (event.y - bounds.top) * scaleY
        );

        // From left to mouse
        this.ctx.fillRect(
            0,
            (event.y - bounds.top) * scaleY,
            (event.x - bounds.left) * scaleX - clearingY,
            thickness
        );
    }

    /**
     * Get an events X coordinate scaled accordingly to the current canvas
     */
    protected scaledX(event: MouseEvent): number {
        const bounds = this.canvas.getBoundingClientRect();

        let result = (event.x - bounds.left) * (this.canvas.width / bounds.width);
        result = Math.round(result);
        return clamp(result, 0, this.canvas.width);
    }

    /**
     * Get an events Y coordinate scaled accordingly to the current canvas
     */
    protected scaledY(event: MouseEvent): number {
        const bounds = this.canvas.getBoundingClientRect();

        let result = (event.y - bounds.top) * (this.canvas.height / bounds.height);
        result = Math.round(result);
        return clamp(result, 0, this.canvas.height);
    }

    /**
     * Draw an annotation that is not yet complete.
     *
     * This can be either one which is currently being drawn or one which is just not yet saved.
     *
     * @param annotation The premature annotation which is supposed get drawn
     */
    public abstract drawPrematureAnnotation(annotation: AnnotationVector);

    /**
     * Draw a completed, existing annotation
     *
     * @param annotation The existing annotation
     */
    public abstract drawAnnotation(annotation: AnnotationInImage);

    /**
     * Method which is supposed to be run in a new AnimationFrame
     *
     * @param clearCanvas Whether or not the canvas should be cleared before drawing on int
     */
    public render(clearCanvas: boolean = true) {
        if (clearCanvas) {
            this.clear();
        }

        // Draw existing visible annotations
        for (const a of this.visibleAnnotations) {
            this.drawAnnotation(a);
        }

        // Try to get a premature annotation from happened events and,
        // then draw and publish that premature annotation
        const result = this.handleEvents();
        if (result !== null) {
            this.drawPrematureAnnotation(result);
            this.result$.next(result);
        } else if (this.result$.getValue() !== null) {
            this.drawPrematureAnnotation(this.result$.getValue());
        }
    }

    /**
     * Clear the whole canvas of any drawings
     */
    public clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private shortenStack(stack: Stack<any>, max_length = 10, short_to = 2) {
        if (stack.size > max_length) {
            while (stack.size > short_to) {
                stack.removeTail();
            }
        }
    }

    public onClick(event: MouseEvent) {
        this.mouseClicks.push(event);
        this.shortenStack(this.mouseClicks);
        this.render();
    }

    public onMouseMove(event: MouseEvent) {
        this.mouseMoves.push(event);
        this.shortenStack(this.mouseMoves);
        this.render();
    }

    public onMouseDown(event: MouseEvent) {
        this.mouseDowns.push(event);
        this.shortenStack(this.mouseDowns);
        this.render();
    }

    public onMouseUp(event: MouseEvent) {
        this.mouseUps.push(event);
        this.shortenStack(this.mouseUps);
        this.render();
    }

    public onMouseLeave(event: MouseEvent) {
        this.mouseMoves.push(event);
        this.render();
    }

    public onMouseEnter(event: MouseEvent) {
        if (event.buttons === 0 && this.mouseDowns.size % 2 === 1) {
            // If a button has been pressed before but is not anymore, remove the original mouseDown
            this.mouseDowns.removeHead();
        } else if (event.buttons === 1 && this.mouseDowns.size % 2 === 0) {
            // If a button was not pressed but is now, create a mouseDown event at the mouseEnter position
            this.mouseDowns.push(event);
        }
        this.render();
    }
}

export function clamp(x: number, min: number, max: number): number {
    return x < min ? min : (x > max ? max : x);
}
