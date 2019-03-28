import {AnnotationVector} from '../../../network/types/annotation';
import {AnnotationMode} from './annotation-mode';

export interface LineVector extends AnnotationVector {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}


export class LineAnnotationMode extends AnnotationMode {
    /** @inheritDoc */
    drawPrematureAnnotation(annotation: LineVector) {
        this.ctx.beginPath();
        this.ctx.moveTo(annotation.x1, annotation.y1);
        this.ctx.lineTo(annotation.x2, annotation.y2);
        this.ctx.lineWidth = 5;
        this.ctx.strokeStyle = '#000000';
        this.ctx.stroke();
        this.ctx.closePath();
    }

    /** @inheritDoc */
    protected handleEvents(): LineVector | null {
        if (this.mouseMoves.size > 0) {
            this.drawCrosshair(this.mouseMoves.top);
        }

        if (this.mouseClicks.size >= 2) {
            const newEvent = this.mouseClicks.pop();
            const oldEvent = this.mouseClicks.top;

            return {
                x1: this.scaledX(oldEvent),
                y1: this.scaledY(oldEvent),
                x2: this.scaledX(newEvent),
                y2: this.scaledY(newEvent)
            };
        }

        return null;
    }

}
