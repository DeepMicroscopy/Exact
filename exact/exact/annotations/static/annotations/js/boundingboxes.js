// JS file for bounding box internals

class BoundingBoxes {
    constructor(viewer, imageid, imageSize) {
        this.selection = undefined;

        this.viewer = viewer;


        this.buttons = [new OpenSeadragon.Button({
            tooltip: 'Substract the slected objects area from all other objects ',
            name: "NOT",
            srcRest: this.viewer.prefixUrl + `NOT.png`,
            srcGroup: this.viewer.prefixUrl + `NOT.png`,
            srcHover: this.viewer.prefixUrl + `NOT_hover.png`,
            srcDown: this.viewer.prefixUrl + `NOT_down.png`,
            onClick: this.clickPolyOperation.bind( this ),
          }),
            new OpenSeadragon.Button({
            tooltip: 'Merge all polygon objects from the same class touching the selected object',
            name: "UNION",
            srcRest: this.viewer.prefixUrl + `UNION.png`,
            srcGroup: this.viewer.prefixUrl + `UNION.png`,
            srcHover: this.viewer.prefixUrl + `UNION_hover.png`,
            srcDown: this.viewer.prefixUrl + `UNION_down.png`,
            onClick: this.clickPolyOperation.bind( this ),
          }),
            new OpenSeadragon.Button({
            tooltip: 'Changes the class of all included objects to selected class if possible',
            name: "HARMONIZE",
            srcRest: this.viewer.prefixUrl + `HARMONIZE_rest.png`,
            srcGroup: this.viewer.prefixUrl + `HARMONIZE_rest.png`,
            srcHover: this.viewer.prefixUrl + `HARMONIZE_hover.png`,
            srcDown: this.viewer.prefixUrl + `HARMONIZE_down.png`,
            onClick: this.clickPolyOperation.bind( this ),
          })]

        this.buttons.forEach(element => {
            viewer.buttons.buttons.push(element);
            viewer.buttons.element.appendChild(element.element);
        });


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
        this.strokeWidth = 3;

        this.resetSelection();
    }
    
    clickPolyOperation(event) {
        if (this.selection) {
            this.viewer.raiseEvent('boundingboxes_PolyOperation', {name: event.eventSource.name});
        }        
    }

    findIncludedObjectsOperation(event) {
        var resultDict = {deleted: [], insert: [], update: [], included: []}

        if (this.selection) {
            for (var i = 0; i < this.group.children.length; i++) {
                var el = this.group.children[i]

                // TODO: check for visibility
                if (el.name !== this.selection.item.name && el.visible === true) {
                    if (el.intersects(this.selection.item) === true) {
                        resultDict.included.push(el.name)
                    }else if(this.selection.item.contains(el.firstSegment.point))
                        resultDict.included.push(el.name)
                }
            }
        }

        return resultDict
    }

    polyUnionOperation(event) {

        var resultDict = {deleted: [], insert: [], update: [], included: []}

        if (this.selection && this.selection.item.data.type === "poly") { 

            var subOptions = {insert: false}
            for (var i = 0; i < this.group.children.length; i++) {
                var el = this.group.children[i]

                // just poly from the same class and saved annotations
                if (el.data.type === "poly" && el.data.type_id === this.selection.item.data.type_id 
                        && el.name.startsWith('#') && el.name !== this.selection.item.name && el.visible === true) {

                    // if intersects --> merge
                    if (el.intersects(this.selection.item) === true) {

                        let result = this.selection.item.unite(el)
                        this.selection.item.remove()

                        this.selection.item = result

                        resultDict.deleted.push(el.name)
                        resultDict.update.push(this.selection.item.name)

                    // no intersection but one point is inside -> delete complete element
                    } else if (this.selection.item.contains(el.firstSegment.point)) { 
                        resultDict.deleted.push(el.name)
                    }
                }
            }
        }
        return resultDict
    }

    polyNotOperation(event) {

        // var operations = ['unite', 'intersect', 'subtract', 'exclude', 'divide'];
        var resultDict = {deleted: [], insert: [], update: [], included: []}
        if (this.selection) {
            var subOptions = {insert: false}

            for (var i = 0; i < this.group.children.length; i++) {
                var el = this.group.children[i]

                // just work on saved annotations
                if (el.name.startsWith('#') && el.name !== this.selection.item.name && el.visible === true) {

                    // if intersects --> substract or divide
                    if (el.intersects(this.selection.item) === true) {

                        let result = el.subtract(this.selection.item, subOptions)
                        
                        if (result.children === undefined) {
                            if (Math.ceil(result.area) !== Math.ceil(el.area)) {
                                el.remove();
                                this.group.addChild(result)
                                
                                resultDict.update.push(result.name)
    
                                i = 0
                            }
                        } else {
                            el.remove();

                            for (var child_id = 0; child_id < result.children.length; child_id++) {
                                // add childs as new elements
                                var old_path = result.children[child_id]
                                var new_path = old_path.clone()
                                new_path.data = old_path.parent.data
                                new_path.strokeColor = old_path.parent.strokeColor
                                new_path.strokeWidth = old_path.parent.strokeWidth
                                new_path.fillColor = old_path.parent.fillColor

                                new_path.name =  '~' + new Date().getMilliseconds() +Math.ceil(Math.random() * 100000);
                                this.group.addChild(new_path);

                                resultDict.insert.push({
                                    annotation_type_id: new_path.data.type_id,
                                    id: new_path.name,
                                    vector: this.getAnnotationVector(new_path.name),
                                    first_editor: {id: null, name: "you"},
                                    last_editor: {id: null, name: "you"},
                                    last_edit_time: new Date(Date.now()),
                                    image: {id: this.imageid}
                                })

                            }
                            result.remove()                            
                            resultDict.deleted.push(el.name)

                            i = 0
                        }
                    // no intersection but one point is inside -> delete complete element
                    } else if (this.selection.item.contains(el.firstSegment.point)) { 
                        resultDict.deleted.push(el.name)
                    }

                }     
            }
        }
        return resultDict;
    }


    getImageId() {
        return this.imageid;
    }

    getAnnotationVector(id) {

        var item = this.getItemFromID(id);
        if (item === undefined)
            return null;

        var vector = {};

        switch (item.data.type) {
            case "rect":
            case "circle":
            case "fixed_rect":
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
        var selection_hit_type = 'fill';
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
                    closed: selected_annotation_type.closed,
                });
                canvasObject.add(imagePoint);
                canvasObject.data.type = "poly";
                selection_hit_type = 'new';
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
                canvasObject.data.type = "fixed_rect";

                break;

        }

        canvasObject.selected = true;
        canvasObject.strokeColor = selected_annotation_type.color_code;
        canvasObject.strokeWidth = this.strokeWidth;
        canvasObject.name = '~' + new Date().getMilliseconds();
        canvasObject.data.type_id = selected_annotation_type.id;
        canvasObject.data.area_hit_test = selected_annotation_type.area_hit_test;

        if (selected_annotation_type.area_hit_test)
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
            type: selection_hit_type,
            item: canvasObject
        };

        // return temp annotation
        return {
            annotation_type: selected_annotation_type,
            id: canvasObject.name,
            vector: this.getAnnotationVector(canvasObject.name),
            first_editor: {id: null, name: "you"},
            last_editor: {id: null, name: "you"},
            last_edit_time: new Date(Date.now()),
            image: {id: this.imageid}
        }
    }

    drawAnnotation(annotation) {
        if (annotation.vector === null) {
            return;
        }

        switch (annotation.annotation_type.vector_type) {
            case 1:  // Rect
                var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);

                rect.strokeColor = annotation.annotation_type.color_code;
                rect.strokeWidth = this.strokeWidth;
                rect.name = '#' + annotation.id;
                if (annotation.annotation_type.area_hit_test)
                    rect.fillColor = new paper.Color(0, 0, 0, 0.000001);
                rect.data.type = "rect";
                rect.data.type_id = annotation.annotation_type.id;
                rect.data.area_hit_test = annotation.annotation_type.area_hit_test;

                this.group.addChild(rect);
                break;


            case 6:
            case 7:
                var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);

                rect.strokeColor = annotation.annotation_type.color_code;
                rect.strokeWidth = this.strokeWidth;
                rect.name = '#' + annotation.id;
                if (annotation.annotation_type.area_hit_test)
                    rect.fillColor = new paper.Color(0, 0, 0, 0.000001);
                rect.data.type = "fixed_rect";
                rect.data.type_id = annotation.annotation_type.id;
                rect.data.area_hit_test = annotation.annotation_type.area_hit_test;

                this.group.addChild(rect);
                break;

            case 2:  // POINT or Elipse
                var rectangle = new paper.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);
                var ellipse = new paper.Shape.Ellipse(rectangle);

                ellipse.strokeColor = annotation.annotation_type.color_code;
                ellipse.strokeWidth = this.strokeWidth;
                ellipse.name = '#' + annotation.id;
                if (annotation.annotation_type.area_hit_test)
                    ellipse.fillColor = new paper.Color(0, 0, 0, 0.000001);
                ellipse.data.type = "circle";
                ellipse.data.type_id = annotation.annotation_type.id;
                ellipse.data.area_hit_test = annotation.annotation_type.area_hit_test;

                this.group.addChild(ellipse);
                break;

            case 3:  // Line
                var line = new paper.Path.Line(new paper.Point(annotation.vector.x1, annotation.vector.y1),
                    new paper.Point(annotation.vector.x2, annotation.vector.y2));

                line.strokeColor = annotation.annotation_type.color_code;
                line.strokeWidth = this.strokeWidth;
                line.name = '#' + annotation.id;
                line.data.type = "line";
                line.data.type_id = annotation.annotation_type.id;
                line.data.area_hit_test = annotation.annotation_type.area_hit_test;

                this.group.addChild(line);
                break;

            case 4:  // MULTI_LINE / POLYGON
            case 5:
                var poly = new paper.Path({
                    strokeColor: annotation.annotation_type.color_code,
                    strokeWidth: this.strokeWidth,
                    name: '#' + annotation.id,
                    closed: annotation.annotation_type.closed,
                });
                if (annotation.annotation_type.area_hit_test)
                    poly.fillColor = new paper.Color(0, 0, 0, 0.000001);

                poly.data.type = "poly";
                poly.data.type_id = annotation.annotation_type.id;
                poly.data.area_hit_test = annotation.annotation_type.area_hit_test;

                var count = Object.keys(annotation.vector).length / 2;
                for (var i = 1; i <= count; i++) {
                    poly.add(new paper.Point(annotation.vector["x" + i], annotation.vector["y" + i]));
                }

                this.group.addChild(poly);
                break;
        }
    }

    updateVisbility(annotation_type_id, visibility ) {

        this.group.children.filter(function (el) {return el.data.type_id === annotation_type_id})
            .forEach(function (el) {
                if (visibility === true && el.data.area_hit_test === true) {
                    el.fillColor = new paper.Color(0, 0, 0, 0.000001);
                }
                else if (visibility === false){
                    el.fillColor = new paper.Color(0, 0, 0, 0);
                }


                el.visible = visibility
            });
    }


    drawExistingAnnotations(annotations) {
        if (annotations === undefined ||
            annotations.length === 0 ||
            !globals.drawAnnotations) {

            return;
        }

        for (var a in annotations) {

            var annotation = annotations[a];

            if (annotation.vector === null || this.getItemFromID(annotation.id) !== undefined) {
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
        if (typeof annotationid === 'number')
            item = this.group.children['#' + annotationid];
        if (typeof annotationid === 'string') {
            if (!isNaN(parseInt(annotationid)))
                item = this.group.children['#' + annotationid];
            else
                item = this.group.children[annotationid];
        }
        return item;
    }

    updateStrokeWidth(width){
        if (width !== null)
            this.strokeWidth = width;
        else { 
            // set stroke width to one percent of the visibile size
            var bounds = this.viewer.viewport.getBounds(true);
            var imageRect = this.viewer.viewport.viewportToImageRectangle(bounds);

            width = Math.max(imageRect.width, imageRect.height) * 0.0025;
            width = Math.max(1, width);
            this.strokeWidth =  width;
        }

        this.group.children.forEach(x => { x.strokeWidth = this.strokeWidth });
    }

    showItem(annotationid) {
        var item = this.getItemFromID(annotationid);
        // if annotation was found zoom to annotation
        if (item !== undefined) {
            const vpRect = this.viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(
                item.bounds.topLeft.x,
                item.bounds.topLeft.y,
                item.bounds.width,
                item.bounds.height
            ));
            const vpPos = this.viewer.viewport.imageToViewportCoordinates(item.bounds.centerX, item.bounds.centerY)
            this.viewer.viewport.fitBoundsWithConstraints(new OpenSeadragon.Rect(
                vpPos.x - vpRect.width / 2,
                vpPos.y - vpRect.height / 2,
                vpRect.width,
                vpRect.height
            ));
        }
    }

    resizeItem(event) {
        if (this.selection) {
            if (this.selection.item.data.type !== "fixed_rect")
            {
                // Convert pixel to viewport coordinates
                var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

                // Convert from viewport coordinates to image coordinates.
                var point = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

                var hit = this.selection.item.hitTest(point, this.hitOptions);
                if (hit) // just resize if mouse is over element
                    this.selection.item.scale(1 + (event.scroll / 10));
            }
        }
    }

    /**
     * Delete current selection.
     */
    resetSelection() {
        //$('.annotation_value').val(0);

        globals.editedAnnotationsId = undefined;
        $('.annotation').removeClass('alert-info');
        globals.editActiveContainer.addClass('hidden');

        $('#AnnotationInformation').hide();
        $('#annotation_buttons').hide();

        if (this.selection !== undefined) {
            this.selection.item.selected = false;
            this.selection = undefined;
        }
    }

    reset() {
        this.clear();
    }

    hitTest(point) {

        var hit = this.group.hitTest(point, this.hitOptions);
        if (hit) {
            if (hit.item.visible === false)
                return undefined;

            if (hit.item.name.startsWith('~'))
                return hit.item.name;
            return parseInt(hit.item.name.replace('#', ''));
        }
        return undefined;
    }

    updateName(tempName, annotationId) {
        if (this.group.getItem({name: tempName}) !== null)
            this.group.getItem({name: tempName}).set({name: '#' + annotationId});
    }

    updateAnnotationType(id, annotation_type, set_as_selected = true) {
        var item = this.getItemFromID(id);

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
                        closed: annotation_type.closed
                    });
                    for (var i = 0; i < item.segments.length; i++) {
                        canvasObject.add(item.segments[i].point);
                    }
                    canvasObject.data.type = "poly";
                    break;

                case 1:  // Rect
                    canvasObject = new paper.Path.Rectangle(item.bounds);
                    canvasObject.data.type = "rect";

                    break;
                case 6:
                    canvasObject = new paper.Path.Rectangle(item.bounds);
                    canvasObject.data.type = "fixed_rect";

                    break;
                default:

                    break;

            }
            canvasObject.strokeColor = annotation_type.color_code;
        }

        if (set_as_selected)
            canvasObject.selected = true;
        canvasObject.strokeWidth = item.strokeWidth;
        canvasObject.data.type_id = annotation_type.id;
        canvasObject.data.area_hit_test = annotation_type.area_hit_test;

        if (annotation_type.area_hit_test)
            canvasObject.fillColor = new paper.Color(0, 0, 0, 0.000001);

        var tempName = item.name;

        item.remove();

        canvasObject.name = tempName;
        this.group.addChild(canvasObject);

        // set object as selected
        if (set_as_selected)
            this.selection = {
                type: "fill",
                item: canvasObject
            };
    }


    clear() {
        this.group.removeChildren();

        this.buttons.forEach(element => {
            this.viewer.buttons.buttons = this.viewer.buttons.buttons.filter(function(value, index, arr){ return value.name !== element.name;});
            if (this.viewer.buttons.element.contains(element.element))
                this.viewer.buttons.element.removeChild(element.element);
        });
    }

    handleMouseDrag(event) {

        if (this.selection) {
            // Convert pixel to viewport coordinates
            var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

            // Convert from viewport coordinates to image coordinates.
            var imagePoint = new paper.Point(this.viewer.viewport.viewportToImageCoordinates(viewportPoint));

            if (!event.shift) {

                switch (this.selection.item.data.type) {
                    case 'poly':
                        if (this.selection.type == 'new') {
                            this.selection.item.add(imagePoint);
                        }
                        //else if (this.selection.type == 'stroke' &&
                        //    this.selection.item.data.type == 'poly' &&
                        //    this.selection.item.segments.length > 3) {
                        //    var location = this.selection.location;
                        //    if (this.selection.location !== undefined) {
                        //        this.selection.item.insert(location.index + 1, imagePoint);
                        //    }
                        //}
                        else if (this.selection.type == 'fill') {

                            var tempRect = this.selection.item.bounds.clone();
                            tempRect.center = imagePoint;

                            if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                                this.selection.item.position = imagePoint;
                        }
                        if (this.selection.type == 'segment') {
                            this.selection.segment.point = this.fixPointToImage(imagePoint);
                        }
                        break;

                    case 'line':

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
                        break;

                    case 'fixed_rect':

                        var tempRect = this.selection.item.bounds.clone();
                        tempRect.center = imagePoint;

                        if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                            this.selection.item.position = imagePoint;


                        break;

                    default:

                        if (this.selection.type == 'fill') {

                            var tempRect = this.selection.item.bounds.clone();
                            tempRect.center = imagePoint;

                            if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                                this.selection.item.position = imagePoint;

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

                        break;
                }
            } else {
                // TODO: erase on the fly

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
            //hitResult.item = this.group.children[hitResult.item.name]
            hitResult.item.selected = true;
            this.selection = hitResult;


            // bounding box coordinates
            var bounding = [hitResult.item.bounds.getTopLeft(), hitResult.item.bounds.getBottomLeft(),
                hitResult.item.bounds.getBottomRight(), hitResult.item.bounds.getTopRight()];

            // sort bounding box coordinates by distance to mouse event
            var sorted = bounding.sort((a, b) => (a.getDistance(point) > b.getDistance(point)) ? 1
                : ((b.getDistance(point) > a.getDistance(point)) ? -1 : 0));

            // save opposite box corner and offset between mouse and next corner
            hitResult.item.data.from = new paper.Point(sorted[sorted.length - 1].x, sorted[sorted.length - 1].y);
            hitResult.item.data.offset_point = new paper.Point(sorted[0].x - point.x, sorted[0].y - point.y);


            if (!event.originalEvent.shiftKey) {
                // if poly add new handling point
                if (this.selection.type == 'stroke' &&
                    this.selection.item.data.type == 'poly' &&
                    this.selection.item.segments.length > 3) {
                    var location = this.selection.location;
                    if (this.selection.location !== undefined) {
                        this.selection.item.insert(location.index + 1, point);
                    }
                }
            } else {
                // or remove point
                if (this.selection.item.data.type == "poly") {
                    if (hitResult.type == 'segment' && this.selection.item.segments.length > 2) {
                        hitResult.segment.remove();
                    }
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
            1: [1, 6],
            2: [2],
            3: [3],
            4: [4],
            5: [5],
            6: [1, 6],
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
