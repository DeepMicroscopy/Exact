// JS file for bounding box internals

class BoundingBoxes {
    constructor(viewer, imageid, imageSize) {
        this.selection = undefined;

        this.viewer = viewer;
        this.overlay = this.viewer.paperjsOverlay();
        this.group = new paper.Group();

        this.hitOptions = {
            segments: true,
            stroke: true,
            fill: true,
            tolerance: 2
        };

        this.imageid = imageid;
        this.image_width = imageSize["width"];
        this.image_hight = imageSize["height"];
        this.new_tag = "newElement"
    }

    getImageId() {
        return this.imageid;
    }

    getHitAnnotationVector() {

        if (this.selection === undefined)
            return undefined;

        var vector = {};

        var item = this.selection.item;

        switch (item.data.type) {
            case "rect":
            case "circle":
                vector["x1"] = Math.round(item.bounds.getTopLeft().x);
                vector["y1"] = Math.round(item.bounds.getTopLeft().y);
                vector["x2"] = Math.round(item.bounds.getBottomRight().x);
                vector["y2"] = Math.round(item.bounds.getBottomRight().y);
                break;
            default:
                var length = item.segments.length;
                for (var i = 1; i <= length; i++) {
                    vector["x" + i] = Math.round(item.segments[i - 1].point.x);
                    vector["y" + i] = Math.round(item.segments[i - 1].point.y);
                }
                break;
        }
        return vector;
    }

    initNewAnnotation(event, selected_annotation_type) {

        // Convert pixel to viewport coordinates
        var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

        // Convert from viewport coordinates to image coordinates.
        var imagePoint = new paper.Point(this.viewer.viewport.viewportToImageCoordinates(viewportPoint));

        var canvasObject = undefined;

        switch (selected_annotation_type.vector_type) {
            case 2:  // POINT or Elipse
                var rectangle = new paper.Rectangle(imagePoint,
                    new paper.Size(selected_annotation_type.default_width, selected_annotation_type.default_hight));
                canvasObject = new paper.Shape.Ellipse(rectangle);
                canvasObject.position = imagePoint;
                canvasObject.data.type = "circle";

                break;

            case 3:  // Line
                canvasObject = new paper.Path(imagePoint);
                canvasObject.data.type = "line";

                break;

            case 4:  // MULTI_LINE / POLYGON
            case 5:
                var canvasObject = new paper.Path({
                    closed: true,
                });
                canvasObject.add(imagePoint);
                canvasObject.data.type = "poly";
                break;

            case 1:  // Rect
                canvasObject = new paper.Path.Rectangle(imagePoint,
                    new paper.Size(selected_annotation_type.default_width, selected_annotation_type.default_hight));
                canvasObject.position = imagePoint;
                canvasObject.data.type = "rect";

                break;
            case 6:
            default:
                canvasObject = new paper.Path.Rectangle(imagePoint,
                    new paper.Size(selected_annotation_type.default_width, selected_annotation_type.default_hight));
                canvasObject.position = imagePoint;
                canvasObject.data.type = "rect";

                break;

        }

        canvasObject.selected = true;
        canvasObject.strokeColor = selected_annotation_type.color_code;
        canvasObject.strokeWidth = 1; //TODO: Find better solution
        canvasObject.name = '~' + new Date().getMilliseconds();
        canvasObject.fillColor = new paper.Color(0, 0, 0, 0.000001);


        // bounding box coordinates
        var bounding = [canvasObject.bounds.getTopLeft(), canvasObject.bounds.getBottomLeft(),
            canvasObject.bounds.getBottomRight(), canvasObject.bounds.getTopRight()];

        // sort bounding box coordinates by distance to mouse event
        var sorted = bounding.sort((a, b) => (a.getDistance(imagePoint) > b.getDistance(imagePoint)) ? 1
            : ((b.getDistance(imagePoint) > a.getDistance(imagePoint)) ? -1 : 0));

        // save opposite box corner and offset between mouse and next corner
        canvasObject.data.from = new paper.Point(sorted[sorted.length - 1].x, sorted[sorted.length - 1].y);
        canvasObject.data.offset_point = new paper.Point(sorted[0].x - imagePoint.x, sorted[0].y - imagePoint.y);

        this.group.addChild(canvasObject);

        // set object as selected
        this.selection = {
            type: "stroke",
            item: canvasObject
        };

        // return temp annotation
        return {
            annotation_type: selected_annotation_type,
            id: canvasObject.name,
            vector: this.getHitAnnotationVector()
        }
    }

    drawAnnotation(annotation) {
        if (annotation.vector === null) {
            return;
        }

        switch (annotation.annotation_type.vector_type) {
            case 1:  // Rect
            case 6:
                var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);

                rect.strokeColor = annotation.annotation_type.color_code;
                rect.strokeWidth = Math.ceil((annotation.vector.x2 - annotation.vector.x1) / 20);
                rect.name = '#' + annotation.id;
                rect.fillColor = new paper.Color(0, 0, 0, 0.000001);
                rect.data.type = "rect";

                this.group.addChild(rect);
                break;

            case 2:  // POINT or Elipse
                var rectangle = new paper.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);
                var ellipse = new paper.Shape.Ellipse(rectangle);

                ellipse.strokeColor = annotation.annotation_type.color_code;
                ellipse.strokeWidth = Math.ceil((annotation.vector.x2 - annotation.vector.x1) / 20);
                ellipse.name = '#' + annotation.id;
                ellipse.fillColor = new paper.Color(0, 0, 0, 0.000001);
                ellipse.data.type = "circle";

                this.group.addChild(ellipse);
                break;

            case 3:  // Line
                var line = new paper.Path.Line(new paper.Point(annotation.vector.x1, annotation.vector.y1),
                    new paper.Point(annotation.vector.x2, annotation.vector.y2));

                line.strokeColor = annotation.annotation_type.color_code;
                line.strokeWidth = 3; // TODO: Find solution
                line.name = '#' + annotation.id;
                line.data.type = "line";

                this.group.addChild(line);
                break;

            case 4:  // MULTI_LINE / POLYGON
            case 5:
                var poly = new paper.Path({
                    strokeColor: annotation.annotation_type.color_code,
                    strokeWidth: 5,
                    name: '#' + annotation.id,
                    closed: true,
                    fillColor: new paper.Color(0, 0, 0, 0.000001)
                });
                poly.data.type = "poly";

                var count = Object.keys(annotation.vector).length / 2;
                for (var i = 1; i <= count; i++) {
                    poly.add(new paper.Point(annotation.vector["x" + i], annotation.vector["y" + i]));
                }

                this.group.addChild(poly);
                break;
        }
    }


    drawExistingAnnotations(annotations) {
        if (annotations.length === 0 || !globals.drawAnnotations) {
            return;
        }

        for (var a in annotations) {

            var annotation = annotations[a];

            if (annotation.vector === null) {
                continue;
            }

            this.drawAnnotation(annotation)
        }

        this.overlay.resize();
        this.overlay.resizecanvas();
    }

    removeAnnotation(annotationid) {
        var item = this.getItemFromID(annotationid);
        if (item !== undefined) {
            item.remove();
        }
    }

    getItemFromID(annotationid) {
        var item = undefined;
        if (typeof annotationid === 'string') {
            item = this.group.children[annotationid];
        } else {
            item = this.group.children['#' + annotationid];
        }
        return item;
    }

    simplifyPoly(annotationid) {
        var item = this.getItemFromID(annotationid);
        if (item !== undefined && item.data.type === "poly") {
            poly.simplify();
        }
    }

    /**
     * Delete current selection.
     */
    resetSelection() {
        $('.annotation_value').val(0);

        globals.editedAnnotationsId = undefined;
        $('.annotation').removeClass('alert-info');
        globals.editActiveContainer.addClass('hidden');
        $('#coordinate_table').hide();
        $('#annotation_buttons').hide();

        if (this.selection !== undefined) {
            this.selection.item.selected = false;
            this.selection = undefined;
        }
    }

    static getTag(field) {
        return '<div id="' + field + 'Box"><div class="col-xs-2" style="max-width: 3em">' +
            '<label for="' + field + 'Field">' + field + '</label>' +
            '</div><div class="col-xs-10">' +
            '<input id="' + field + 'Field" class="Coordinates annotation_value form-control"' +
            'type="text" name="' + field + 'Field" value="0" min="0" disabled>' +
            '</div><div class="col-xs-12"></div></div>';
    }

    reset() {
        this.clear();
    }

    hitTest(point) {

        var hit = this.group.hitTest(point, this.hitOptions);
        if (hit) {
            if (hit.item.name.startsWith('~'))
                return hit.item.name;
            return parseInt(hit.item.name.replace('#', ''));
        }
        return undefined;
    }

    updateName(tempName, annotationId) {
        this.group.getItem({name: tempName}).set({name: '#' + annotationId});
    }

    updateAnnotationType(id, annotation_type) {
        var item = this.getItemFromID(id)

        if (item !== null) {

            // TODO: Zeiche annotation mit neuem vector typ
            switch (annotation_type.vector_type) {
                case 2:  // POINT or Elipse
                    canvasObject = new paper.Shape.Ellipse(item.bounds);
                    canvasObject.data.type = "circle";

                    break;

                case 3:  // Line
                    canvasObject = new paper.Path(item.bounds.topLeft);
                    canvasObject.add(item.bounds.bottomRight);
                    canvasObject.data.type = "line";

                    break;

                case 4:  // MULTI_LINE / POLYGON
                case 5:
                    var canvasObject = new paper.Path({
                        closed: true
                    });
                    for (var i = 0; i < item.segments.lenght; i++) {
                        canvasObject.add(item.segments[i].point);
                    }
                    canvasObject.data.type = "poly";
                    break;

                case 1:  // Rect
                case 6:
                    canvasObject = new paper.Path.Rectangle(item.bounds);
                    canvasObject.data.type = "rect";

                    break;
                default:

                    break;

            }
            canvasObject.strokeColor = annotation_type.color_code;
        }

        canvasObject.selected = true;
        canvasObject.strokeWidth = item.strokeWidth;
        canvasObject.fillColor = new paper.Color(0, 0, 0, 0.000001);

        var tempName = item.name;

        item.remove();

        canvasObject.name = tempName;
        this.group.addChild(canvasObject);

        // set object as selected
        this.selection = {
            type: "stroke",
            item: canvasObject
        };

    }


    clear() {
        this.group.removeChildren();
    }

    handleMouseDrag(event) {

        if (this.selection) {
            // Convert pixel to viewport coordinates
            var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

            // Convert from viewport coordinates to image coordinates.
            var imagePoint = new paper.Point(this.viewer.viewport.viewportToImageCoordinates(viewportPoint));

            if (!event.shift) {

                if (this.selection.type == 'fill') {

                    var tempRect = this.selection.item.bounds.clone();
                    tempRect.center = imagePoint;

                    if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                        this.selection.item.position = imagePoint;

                } else if (this.selection.item.data.type == "poly") {

                    if (this.selection.type == 'segment') {
                        this.selection.segment.point = this.fixPointToImage(imagePoint);
                    } else {
                        this.selection.item.add(imagePoint);
                    }


                } else if (this.selection.item.data.type == "line") {

                    if (this.selection.item.segments.length == 1) {
                        this.selection.item.add(imagePoint);

                    } else {
                        // check if mouse is near to first, second or center point and move that one
                        if (this.selection.item.segments[0].point.getDistance(imagePoint)
                            < this.selection.item.position.getDistance(imagePoint)) {
                            this.selection.item.segments[0].point = imagePoint;

                        } else if (this.selection.item.segments[1].point.getDistance(imagePoint)
                            < this.selection.item.position.getDistance(imagePoint)) {
                            this.selection.item.segments[1].point = imagePoint;
                        } else {
                            this.selection.item.position = imagePoint;
                        }
                    }
                } else {
                    var offset = imagePoint.add(this.selection.item.data.offset_point);
                    var min_x = Math.min(this.selection.item.data.from.x, offset.x);
                    var min_y = Math.min(this.selection.item.data.from.y, offset.y);
                    var max_x = Math.max(this.selection.item.data.from.x, offset.x);
                    var max_y = Math.max(this.selection.item.data.from.y, offset.y);

                    if (max_x - min_x < 10) max_x = min_x + 10;
                    if (max_y - min_y < 10) max_y = min_y + 10;

                    // fix annotation to image
                    var topLeft = this.fixPointToImage(new paper.Point(min_x, min_y));
                    var bottomRight = this.fixPointToImage(new paper.Point(max_x, max_y));

                    this.selection.item.bounds = new paper.Rectangle(topLeft, bottomRight);
                }
            } else { // erase mode
                if (this.selection.item.data.type == "poly") {
                    var hit = this.selection.item.hitTest(imagePoint, this.hitOptions);
                    if (hit !== null && hit.type == 'segment') {
                        hit.segment.remove();
                    }
                    ;

                }
            }
        }

    }

    handleMousePress(event) {

        // Convert pixel to viewport coordinates
        var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

        // Convert from viewport coordinates to image coordinates.
        var point = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

        var hitResult = this.group.hitTest(point, this.hitOptions);

        if (hitResult) {
            this.selection = hitResult;
            hitResult.item.selected = true;

            // bounding box coordinates
            var bounding = [hitResult.item.bounds.getTopLeft(), hitResult.item.bounds.getBottomLeft(),
                hitResult.item.bounds.getBottomRight(), hitResult.item.bounds.getTopRight()];

            // sort bounding box coordinates by distance to mouse event
            var sorted = bounding.sort((a, b) => (a.getDistance(point) > b.getDistance(point)) ? 1
                : ((b.getDistance(point) > a.getDistance(point)) ? -1 : 0));

            // save opposite box corner and offset between mouse and next corner
            hitResult.item.data.from = new paper.Point(sorted[sorted.length - 1].x, sorted[sorted.length - 1].y);
            hitResult.item.data.offset_point = new paper.Point(sorted[0].x - point.x, sorted[0].y - point.y);


            // if poly add new handling point
            if (this.selection.type == 'stroke' &&
                this.selection.item.data.type == 'poly' &&
                this.selection.item.segments.length > 3) {
                var location = this.selection.location;
                if (this.selection.location !== undefined) {
                    this.selection.item.insert(location.index + 1, point);
                }
            }

            return parseInt(hitResult.item.name.replace('#', ''));
        }

        return undefined;
    }

    handleMouseUp(event) {

    }

    handleEscape() {
        this.resetSelection();
    }

    handleMouseDown(event) {
    }

    handleMousemove() {

    }

    checkIfAnnotationTypeChangeIsValid(sourceId, targetId) {
        const validConversions = {
            1: [1, 2, 3, 4, 5, 6],
            2: [1, 2, 6],
            3: [1, 2, 3, 5, 6],
            4: [1, 4, 5],
            5: [5],
            6: [1, 2, 3, 4, 5, 6],
        }

        if (sourceId in validConversions) {
            return validConversions[sourceId].includes(targetId);
        } else {
            return false;
        }

    }

    isPointInImage(point) {
        return point.x > 0 && point.x < this.image_width
            && point.y > 0 && point.y < this.image_hight;
    }

    fixPointToImage(point) {
        point.x = (Math.min(Math.max(0, point.x), this.image_width));
        point.y = (Math.min(Math.max(0, point.y), this.image_hight));
        return point;
    }
}
