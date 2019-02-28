import {Observable, Subject} from 'rxjs';
import {AnnotationType} from '../../../network/types/annotationType';
import {Stack} from 'stack-typescript';
import {AnnotationVector} from '../../../network/types/annotation';


export abstract class AnnotationMode {

    protected mouseClicks: Stack<MouseEvent> = new Stack();
    protected mouseMoves: Stack<MouseEvent> = new Stack();
    protected mouseDowns: Stack<MouseEvent> = new Stack();
    protected mouseUps: Stack<MouseEvent> = new Stack();
    protected mouseLeaves: Stack<MouseEvent> = new Stack();

    protected canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    /**
     * Begin handling of events which happen on the canvas.
     * How these events are handled is determined by the actual implementation.
     * Examples include bounding box or polygons
     *
     * @param canvas The HTMLCanvasElement on which events occur
     */
    public abstract handle(canvas: HTMLCanvasElement): Observable<AnnotationVector>;

    /**
     * Reset the current drawing as if nothing was ever drawn at all
     */
    public abstract reset();

    /**
     * Render the screen anew since events have happened
     */
    protected abstract render();

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
        this.mouseLeaves.push(event);
        this.shortenStack(this.mouseLeaves);
        requestAnimationFrame(() => this.render());
    }
}
