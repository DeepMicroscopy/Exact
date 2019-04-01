import {AnnotationMode} from './annotation-mode';
import {AnnotationVector} from '../../../network/types/annotation';
import {AnnotationInImage} from '../../../network/types/image';


export interface PointVector extends AnnotationVector {
    x: number;
    y: number;
}


export class PointAnnotationMode extends AnnotationMode {
    /** @inheritDoc */
    drawPrematureAnnotation(annotation: PointVector) {
        const innerSize = 3;
        const outerSize = 20;
        const style = '#000000';

        // Draw inner circle
        this.ctx.beginPath();
        this.ctx.arc(annotation.x, annotation.y, innerSize, 0, 2 * Math.PI, false);
        this.ctx.fillStyle = style;
        this.ctx.fill();
        this.ctx.closePath();

        // Draw outer circle
        this.ctx.beginPath();
        this.ctx.arc(annotation.x, annotation.y, outerSize, 0, 2 * Math.PI, false);
        this.ctx.lineWidth = innerSize;
        this.ctx.strokeStyle = style;
        this.ctx.stroke();
        this.ctx.closePath();
    }

    /** @inheritDoc */
    drawAnnotation(annotation: AnnotationInImage) {
        this.drawPrematureAnnotation(annotation.vector as PointVector);
    }

    /** @inheritDoc */
    protected handleEvents(): PointVector | null {
        if (this.mouseMoves.size > 0) {
            this.drawCrosshair(this.mouseMoves.top);
        }

        if (this.mouseClicks.size > 0) {
            return {
                x: this.scaledX(this.mouseClicks.top),
                y: this.scaledY(this.mouseClicks.top)
            } as PointVector;
        } else {
            return null;
        }
    }
}
