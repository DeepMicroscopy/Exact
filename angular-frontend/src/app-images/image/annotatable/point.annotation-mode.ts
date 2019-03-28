import {AnnotationMode} from './annotation-mode';
import {AnnotationVector} from '../../../network/types/annotation';


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
    protected handleEvents(): PointVector | null {
        if (this.mouseMoves.size > 0) {
            this.drawCrosshair(this.mouseMoves.top);
        }

        if (this.mouseDowns.size > 0) {
            return this.calcAnnotation(this.mouseDowns.top);
        } else {
            return null;
        }
    }

    protected calcAnnotation(event: MouseEvent): PointVector {
        const bounds = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / bounds.width;
        const scaleY = this.canvas.height / bounds.height;

        return {
            x: (event.x - bounds.left) * scaleX,
            y: (event.y - bounds.top) * scaleY
        };
    }
}
