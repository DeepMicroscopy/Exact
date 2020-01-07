
class ScreeningTool {

    constructor(imageid, screeningTiles, x_steps, y_steps, currentIndex) {

        this.x_steps = x_steps;
        this.y_steps = y_steps;

        this.screeningTiles = screeningTiles;

        this.currentIndex = currentIndex;
        this.imageid = imageid;
    }

    getCurrentIndx() {
        return this.currentIndex;
    }

    getTiles(screened) {
        if (screened === undefined)
            return this.screeningTiles;

        return Object.fromEntries(Object.entries(this.screeningTiles).filter(([k,v]) => v['Screened'] ===  screened));
    }

    getProgress() {
        return (Object.keys(this.screeningTiles).filter(key => { return this.screeningTiles[parseInt(key)]['Screened']
            === true}).length / (this.x_steps * this.y_steps)) * 100;
    }

    getXSteps() {
        return this.x_steps;
    }

    getYSteps() {
        return this.y_steps;
    }

    getImageId() {
        return this.imageid;
    }

    getCurrentPosition() {
        return this.screeningTiles[this.currentIndex];
    }

    movePosition(point) {

        var positions =
            Object.fromEntries(Object.entries(this.screeningTiles).filter(([k,v]) => v['x_min'] <=  point.x
                && v['x_max'] > point.x && v['y_min'] <=  point.y && v['y_max'] >  point.y));

        if (Object.keys(positions).length > 0)
            this.currentIndex = parseInt(Object.keys(positions)[0]);

        return this.screeningTiles[this.currentIndex];
    }

    moveUp() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex - this.x_steps >= 0)
            this.currentIndex = this.currentIndex - this.x_steps;

        return this.screeningTiles[this.currentIndex];
    }

    moveDown() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex + this.x_steps < this.x_steps * this.y_steps)
            this.currentIndex = this.currentIndex + this.x_steps;

        return this.screeningTiles[this.currentIndex];
    }

    moveLeft() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex - 1 >= 0)
            this.currentIndex = this.currentIndex - 1;

        return this.screeningTiles[this.currentIndex];
    }

    moveRight() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex + 1 < this.x_steps * this.y_steps)
            this.currentIndex = this.currentIndex + 1;

        return this.screeningTiles[this.currentIndex];
    }
}