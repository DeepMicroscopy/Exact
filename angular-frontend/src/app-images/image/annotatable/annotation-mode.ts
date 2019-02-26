import {Observable, Subject} from 'rxjs';
import {AnnotationType} from '../../../network/types/annotationType';


export abstract class AnnotationMode {

    protected click$: Subject<MouseEvent> = new Subject();
    protected move$: Subject<MouseEvent> = new Subject();

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
    abstract handle(canvas: HTMLCanvasElement): Observable<PrematureAnnotation>;

    /**
     * Reset the current drawing as if nothing was ever drawn at all
     */
    abstract reset();

    protected draw_crosshair(event: MouseEvent) {
        const ctx = this.canvas.getContext('2d');
        const bounds = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / bounds.width;
        const scaleY = this.canvas.height / bounds.height;

        const thickness = 4;
        const clearingY = 32;
        const clearingX = 32;
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

    public onClick(event: MouseEvent) {
        this.click$.next(event);
    }

    public onMouseMove(event: MouseEvent) {
        this.move$.next(event);
    }
}


export interface PrematureAnnotation {
    annotationType: AnnotationType;
    notInImage: boolean;
    concealed: boolean;
    blurred: boolean;
}
