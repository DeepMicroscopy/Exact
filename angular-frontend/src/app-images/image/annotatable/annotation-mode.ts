import {BehaviorSubject, Subject} from 'rxjs';
import {Stack} from 'stack-typescript';
import {AnnotationVector} from '../../../network/types/annotation';


export abstract class AnnotationMode {

    public result$: BehaviorSubject<AnnotationVector | null> = new BehaviorSubject(null);

    protected mouseClicks: Stack<MouseEvent> = new Stack();
    protected mouseMoves: Stack<MouseEvent> = new Stack();
    protected mouseDowns: Stack<MouseEvent> = new Stack();
    protected mouseUps: Stack<MouseEvent> = new Stack();

    protected canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
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
        const ctx = this.canvas.getContext('2d');
        const bounds = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / bounds.width;
        const scaleY = this.canvas.height / bounds.height;

        const thickness = 4;
        const clearingY = 16;
        const clearingX = 16;
        ctx.fillStyle = '#FF0000';

        // From top to mouse
        ctx.fillRect(
            (event.x - bounds.left) * scaleX,
            0,
            thickness,
            (event.y - bounds.top) * scaleY - clearingY
        );

        // From mouse to right
        ctx.fillRect(
            (event.x - bounds.left) * scaleX + clearingX,
            (event.y - bounds.top) * scaleY,
            this.canvas.width - clearingX - (event.x - bounds.left) * scaleX,
            thickness
        );

        // From mouse to bottom
        ctx.fillRect(
            (event.x - bounds.left) * scaleX,
            (event.y - bounds.top) * scaleY + clearingY,
            thickness,
            this.canvas.height - clearingY - (event.y - bounds.top) * scaleY
        );

        // From left to mouse
        ctx.fillRect(
            0,
            (event.y - bounds.top) * scaleY,
            (event.x - bounds.left) * scaleX - clearingY,
            thickness
        );
    }

    /**
     * Draw an annotation that is not yet complete.
     *
     * This can be either one which is currently being drawn or one which is just not yet saved.
     */
    public abstract drawPrematureAnnotation(annotation: AnnotationVector);

    /**
     * Method which is supposed to be run in a new AnimationFrame
     */
    private render() {
        // Clear canvas
        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);

        const result = this.handleEvents();

        if (result !== null) {
            this.drawPrematureAnnotation(result);
            this.result$.next(result);
        } else if (this.result$.getValue() !== null) {
            this.drawPrematureAnnotation(this.result$.getValue());
        }
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
        requestAnimationFrame(() => this.render());
    }

    public onMouseMove(event: MouseEvent) {
        this.mouseMoves.push(event);
        this.shortenStack(this.mouseMoves);
        requestAnimationFrame(() => this.render());
    }

    public onMouseDown(event: MouseEvent) {
        this.mouseDowns.push(event);
        this.shortenStack(this.mouseDowns);
        requestAnimationFrame(() => this.render());
    }

    public onMouseUp(event: MouseEvent) {
        this.mouseUps.push(event);
        this.shortenStack(this.mouseUps);
        requestAnimationFrame(() => this.render());
    }

    public onMouseLeave(event: MouseEvent) {
        this.mouseMoves.push(event);
        requestAnimationFrame(() => this.render());
    }

    public onMouseEnter(event: MouseEvent) {
        if (event.buttons === 0 && this.mouseDowns.size % 2 === 1) {
            // If a button has been pressed before but is not anymore, remove the original mouseDown
            this.mouseDowns.removeHead();
        } else if (event.buttons === 1 && this.mouseDowns.size % 2 === 0) {
            // If a button was not pressed but is now, create a mouseDown event at the mouseEnter position
            this.mouseDowns.push(event);
        }
        requestAnimationFrame(() => this.render());
    }
}
