
class ScreeningTool {

    constructor(imageInformation, user_id, gHeaders, viewer, overlap = 0.1) {

        this.imageInformation = imageInformation;
        this.imageid = imageInformation['id'];
        this.gHeaders = gHeaders;
        this.viewer = viewer;
        $("#screening_resolution_update_btn").attr("disabled", true);

        this.user_id = user_id;
        this.screeningOverlap = overlap;

        this.screening_sync = new EXACTScreeningModeSync(this.imageid, user_id, gHeaders, viewer);

        this.initUiEvents(this);
    }

    handleKeyUp(event) {

        if (event.target.id === "TEXTAREA"
            || event.target.nodeName == 'INPUT')
            return;

        switch (event.keyCode) {
            case 65: //a left tile
                var coordinates = this.moveLeft();
                this.viewer.raiseEvent('viewCoordinates', { coordinates });

                break;
            case 87: //w up tile
                var coordinates = this.moveUp();
                this.viewer.raiseEvent('viewCoordinates', { coordinates });

                break;

            case 83: //s down tile
                var coordinates = this.moveDown();
                this.viewer.raiseEvent('viewCoordinates', { coordinates });

                break;
            case 68: //d right tile
                var coordinates = this.moveRight();
                this.viewer.raiseEvent('viewCoordinates', { coordinates });

                break;
        }
    };


    initUiEvents(context) {

        $(document).keyup(this.handleKeyUp.bind(this));

        $("#screening_resolution_update_btn").click(this.startScreeningMode.bind(this));

        this.viewer.addHandler("sync_ScreeningModeLoaded", function (event) {

            // Enable Screening start button
            $("#screening_resolution_update_btn").attr("disabled", false);

            $('#screeningResolutionX').val(event.screening_mode.x_resolution);
            $('#screeningResolutionY').val(event.screening_mode.y_resolution);

            $('#screeningImage').attr('src', `/api/v1/images/images/${event.userData.imageid}/thumbnail`);
            $('#screeningImage').on('load', event.userData.updateThumbnail.bind(context));
        }, this);

        this.viewer.addHandler("sync_ScreeningModeNotInitialised", function (event) {

            // Enable Screening start button
            $("#screening_resolution_update_btn").attr("disabled", false);
        }, this);

        this.viewer.addHandler("navigator-click", function (event) {

            if (event.userData.screening_sync.screening_mode !== undefined) {
                event.preventDefaultAction = true;

                var target = this.userData.viewer.navigator.viewport.pointFromPixel(event.position);
                var imagePoint = this.userData.viewer.viewport.viewportToImageCoordinates(target);

                var coordinates = this.userData.movePosition(imagePoint);
                this.userData.viewer.raiseEvent('viewCoordinates', { coordinates });
            }
        }, this);
    }

    get x_resolution() {
        return this.screening_sync.screening_mode.x_resolution;
    }

    get y_resolution() {
        return this.screening_sync.screening_mode.y_resolution;
    }

    get screeningTiles() {
        return this.screening_sync.screening_mode.screening_tiles;
    }

    get x_steps() {
        return this.screening_sync.screening_mode.x_steps;
    }

    get y_steps() {
        return this.screening_sync.screening_mode.y_steps;
    }

    get currentIndex() {
        return this.screening_sync.screening_mode.current_index;
    }

    set currentIndex(index) {

        this.screening_sync.updateCurrentIndex(index);
        this.screening_sync.screening_mode.screening_tiles[index].Screened = true;

        this.updateThumbnail();
    }


    updateThumbnail(event) {

        let tiles_dict = this.screening_sync.screening_mode.screening_tiles;
        let current_index = this.screening_sync.screening_mode.current_index;


        let imgElement = document.getElementById('screeningImage');
        if (imgElement !== undefined) {
            let mat = cv.imread(imgElement);

            let scale_x = this.imageInformation.width / mat.cols;
            let scale_y = this.imageInformation.height / mat.rows;

            for (const tile_index of Object.keys(tiles_dict)) {

                let tile = tiles_dict[tile_index];
                let x_min = Math.round(tile.x_min / scale_x);
                let y_min = Math.round(tile.y_min / scale_y);
                let x_max = Math.round(tile.x_max / scale_x);
                let y_max = Math.round(tile.y_max / scale_y);

                let topLeft = new cv.Point(x_min, y_min);
                let bottomRight = new cv.Point(x_max, y_max);

                if (parseInt(tile_index) === current_index) {
                    let color = new cv.Scalar(255, 0, 255, 255);
                    cv.rectangle(mat, topLeft, bottomRight, color, 5);
                } else if (tile.Screened === true) {
                    let color = new cv.Scalar(0, 255, 0, 255);
                    cv.rectangle(mat, topLeft, bottomRight, color, 5);
                }
            }

            cv.imshow('screeningImageOutput', mat);
            mat.delete();
        }
    }

    startScreeningMode(event) {

        event.preventDefault();

        let x_resolution = parseInt($('#screeningResolutionX').val());
        let y_resolution = parseInt($('#screeningResolutionY').val());

        if ($('#screeningResolutionY').val() === '' || $('#screeningResolutionX').val() === '') {
            $.notify('Please insert a valid resolution in pixel.', { position: 'top', className: 'warn' });
            return false;
        }

        // if screening_mode is loaded and the screening resolution has not changed start screening
        if (this.screening_sync.screening_mode !== undefined &&
            this.x_resolution === x_resolution &&
            this.y_resolution === y_resolution) {

            var coordinates = this.getCurrentPosition();

            this.viewer.raiseEvent('viewCoordinates', { coordinates });

            // update screening mode after screening resolution changed
        } else if (this.screening_sync.screening_mode !== undefined &&
            (this.x_resolution !== x_resolution ||
                this.y_resolution !== y_resolution)) {

            $("#screening_resolution_update_btn").attr("disabled", true);

            let new_tiles = this.createTiles(x_resolution, y_resolution, this.imageInformation.width, this.imageInformation.height);

            let screeningTiles = new_tiles.screeningTiles;
            let x_steps = new_tiles.x_steps;
            let y_steps = new_tiles.y_steps;

            let data = {
                x_steps: x_steps,
                y_steps: y_steps,
                x_resolution: x_resolution,
                y_resolution: y_resolution,
                screening_tiles: screeningTiles,
                current_index: 0,
            }

            this.screening_sync.update(data);

        } else if (this.screening_sync.screening_mode === undefined) { // create new screening mode

            $("#screening_resolution_update_btn").attr("disabled", true);

            let new_tiles = this.createTiles(x_resolution, y_resolution, this.imageInformation.width, this.imageInformation.height);

            let screeningTiles = new_tiles.screeningTiles;
            let x_steps = new_tiles.x_steps;
            let y_steps = new_tiles.y_steps;

            let data = {
                x_steps: x_steps,
                y_steps: y_steps,
                x_resolution: x_resolution,
                y_resolution: y_resolution,
                screening_tiles: screeningTiles,
                current_index: 0,
                user: this.user_id,
                image: this.imageid
            }

            this.screening_sync.create(data);
        }

    }

    createTiles(resolution_x, resolution_y, image_width, image_height) {

        let screeningTiles = {};
        let index = 0;
        let x_steps = 0;
        let y_steps = 0;

        for (let y = 0; y < image_height; y += resolution_y) {
            y_steps += 1;
            x_steps = 0;
            for (let x = 0; x < image_width; x += resolution_x) {
                x_steps += 1;

                screeningTiles[index] = {};
                screeningTiles[index]['Screened'] = false;
                screeningTiles[index]['x_min'] = x;
                screeningTiles[index]['y_min'] = y;
                screeningTiles[index]['x_max'] = x + resolution_x;
                screeningTiles[index]['y_max'] = y + resolution_y;

                index += 1;
            }
        }
        return { 'screeningTiles': screeningTiles, 'x_steps': x_steps, 'y_steps': y_steps }
    }

    getScreeningMode() {
        this.screening_sync.screening_mode;
    }

    calcOverlap(tile) {
        let width_overlap = (tile.x_max - tile.x_min) * this.screeningOverlap;
        let height_overlap = (tile.y_max - tile.y_min) * this.screeningOverlap;

        let result = {
            x_min: tile.x_min - width_overlap,
            x_max: tile.x_max + width_overlap,
            y_min: tile.y_min - height_overlap,
            y_max: tile.y_max + height_overlap,
        };

        return result;
    }

    getTiles(screened) {
        if (screened === undefined)
            return this.screeningTiles;

        return Object.fromEntries(Object.entries(this.screeningTiles).filter(([k, v]) => v['Screened'] === screened));
    }

    getProgress() {
        return (Object.keys(this.screeningTiles).filter(key => {
            return this.screeningTiles[parseInt(key)]['Screened']
                === true
        }).length / (this.x_steps * this.y_steps)) * 100;
    }

    getImageId() {
        return this.imageid;
    }

    getCurrentPosition() {
        return this.calcOverlap(this.screeningTiles[this.currentIndex]);
    }

    movePosition(point) {

        var positions =
            Object.fromEntries(Object.entries(this.screeningTiles).filter(([k, v]) => v['x_min'] <= point.x
                && v['x_max'] > point.x && v['y_min'] <= point.y && v['y_max'] > point.y));

        if (Object.keys(positions).length > 0)
            this.currentIndex = parseInt(Object.keys(positions)[0]);

        return this.calcOverlap(this.screeningTiles[this.currentIndex]);
    }

    moveUp() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex - this.x_steps >= 0)
            this.currentIndex = this.currentIndex - this.x_steps;

        return this.calcOverlap(this.screeningTiles[this.currentIndex]);
    }

    moveDown() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex + this.x_steps < this.x_steps * this.y_steps)
            this.currentIndex = this.currentIndex + this.x_steps;

        return this.calcOverlap(this.screeningTiles[this.currentIndex]);
    }

    moveLeft() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex - 1 >= 0)
            this.currentIndex = this.currentIndex - 1;

        return this.calcOverlap(this.screeningTiles[this.currentIndex]);
    }

    moveRight() {

        this.screeningTiles[this.currentIndex]['Screened'] = true;

        if (this.currentIndex + 1 < this.x_steps * this.y_steps)
            this.currentIndex = this.currentIndex + 1;

        return this.calcOverlap(this.screeningTiles[this.currentIndex]);
    }

    destroy() {
        // unload image
        //$('#screeningImage').attr('src', ``);

        $("#screening_resolution_update_btn").off("click");
        $('#screeningImage').off('load');

        $(document).off('keyup');
    }
}