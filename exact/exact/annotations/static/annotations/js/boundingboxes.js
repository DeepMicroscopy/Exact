// JS file for bounding box internals

class BoundingBoxes {
    constructor(viewer, imageid, imageSize) {
        this.viewer = viewer;
        this.current_item = undefined;

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
        this.polyStrokeWidth = 1;

        this.resetSelection();
    }

    get selection () {
        return this.current_item;
    }

    set selection (item) {

        let current_uuid;
        let new_uuid;
        if (this.current_item !== undefined) {
            current_uuid = this.current_item.item.name
        }

        if (item !== undefined) {
            new_uuid = item.item.name

            // update type
            if (this.current_item !== undefined) {
                this.current_item.type = item.type;
            }
        }

        if (new_uuid !== current_uuid) {
            this.current_item = item;

            if (item === undefined) {
                this.viewer.raiseEvent('tool_StopedAnnotationEditing', {  });
            } else {
                let uuid = item.item.name;
                this.viewer.raiseEvent('tool_StartAnnotationEditing', { uuid });
            }
        }
    }        
    
    clickPolyOperation(event) {
        if (this.selection) {
            this.viewer.raiseEvent('boundingboxes_PolyOperation', {name: event.eventSource.name});
        }        
    }

    findIncludedObjectsOperation() {
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

    polyUnionOperation() {

        var resultDict = {deleted: [], insert: [], update: [], included: []}

        if (this.selection && this.selection.item.data.type === "poly") { 

            var subOptions = {insert: false}
            for (var i = 0; i < this.group.children.length; i++) {
                var el = this.group.children[i]

                // just poly from the same class and saved annotations
                if (el.data.type === "poly" && el.data.type_id === this.selection.item.data.type_id 
                        && el.name !== this.selection.item.name && el.visible === true) {

                    // if intersects --> merge
                    if (el.intersects(this.selection.item) === true) {

                        let result = this.selection.item.unite(el)
                        // error occurce if the result can not represented as one poly
                        if (result.children === undefined) {

                            this.selection.item.remove();

                            this.selection.item = result;
    
                            resultDict.deleted.push(el.name);
                            resultDict.update.push(this.selection.item.name);
                        }

                    // no intersection but one point is inside -> delete complete element
                    } else if (this.selection.item.contains(el.firstSegment.point)) { 
                        resultDict.deleted.push(el.name)
                    }
                }
            }
        }
        return resultDict
    }

    polyNotOperation() {

        // var operations = ['unite', 'intersect', 'subtract', 'exclude', 'divide'];
        var resultDict = {deleted: [], insert: [], update: [], included: []}
        if (this.selection) {
            var subOptions = {insert: false}

            for (var i = 0; i < this.group.children.length; i++) {
                var el = this.group.children[i]

                // just work on saved annotations
                if (el.name !== this.selection.item.name && el.visible === true) {

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

                                new_path.name =  self.uuidv4();
                                this.group.addChild(new_path);

                                resultDict.insert.push({
                                    annotation_type: selected_annotation_type,
                                    id: -1,
                                    vector: this.getAnnotationVector(new_path.name),
                                    user: {id: null, username: "you"},
                                    last_editor: {id: null, username: "you"},
                                    image: this.imageid,
                                    unique_identifier: canvasObject.name,
                                    deleted: false
                                });

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

    uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }

    getImageId() {
        return this.imageid;
    }

    getAnnotationVector(unique_identifier) {

        var item = this.getItemFromUUID(unique_identifier);
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
                if (item.segments === undefined)
                    console.log("ERORORORO")
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
        canvasObject.name = this.uuidv4();
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
            id: -1,
            vector: this.getAnnotationVector(canvasObject.name),
            user: {id: null, username: "you"},
            last_editor: {id: null, username: "you"},
            image: this.imageid,
            unique_identifier: canvasObject.name,
            deleted: false
        }
    }

    drawAnnotation(annotation) {
        if (annotation.vector === null || annotation.deleted) {
            return;
        }

        switch (annotation.annotation_type.vector_type) {
            case 1:  // Rect
                var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);

                rect.strokeColor = annotation.annotation_type.color_code;
                rect.strokeWidth = this.strokeWidth;
                rect.name = annotation.unique_identifier;
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
                rect.name = annotation.unique_identifier;
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
                ellipse.name = annotation.unique_identifier;
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
                line.name = annotation.unique_identifier;
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
                    name: annotation.unique_identifier,//'#' + annotation.id,
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

    updateAnnotationVisibility(unique_identifier, visibility) {
        var item = this.getItemFromUUID(unique_identifier);

        if (item !== undefined) {
            if (visibility === true && item.data.area_hit_test === true) {
                item.fillColor = new paper.Color(0, 0, 0, 0.000001);
            }
            else if (visibility === false){
                item.fillColor = new paper.Color(0, 0, 0, 0);
            }


            item.visible = visibility; 
        }
    }

    updateVisbility(annotation_type_id, visibility ) {

        this.group.children.filter(function (el) {return el.data.type_id === parseInt(annotation_type_id)})
            .forEach(function (el) {
                if (visibility === true && el.data.area_hit_test === true) {
                    el.fillColor = new paper.Color(0, 0, 0, 0.000001);
                }
                else if (visibility === false){
                    el.fillColor = new paper.Color(0, 0, 0, 0);
                }


                el.visible = visibility;
            });
    }


    drawExistingAnnotations(annotations, drawAnnotations=true) {
        if (annotations === undefined ||
            annotations.length === 0 ||
            !drawAnnotations) {

            return;
        }

        for (var annotation of annotations) {

            if (annotation.vector === null || this.getItemFromUUID(annotation.unique_identifier) !== undefined) {
                continue;
            }

            this.drawAnnotation(annotation)
        }

        this.overlay.resize();
        this.overlay.resizecanvas();
    }

    removeAnnotation(unique_identifier) {
        var item = this.getItemFromUUID(unique_identifier);
        if (item !== undefined) {
            // if the current item is removed reset selection
            if (this.selection !== undefined && 
                unique_identifier === this.selection.item.name) {
                this.resetSelection();    
            }
            item.remove();
        }
    }

    getItemFromUUID(unique_identifier) {
        var item = this.group.children[unique_identifier];
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

    showItem(annotation) {
        if (annotation === undefined)
            return
        var item = this.getItemFromUUID(annotation.unique_identifier);
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
                if (hit && this.selection.item.data.type !== "poly") // just resize if mouse is over element
                    this.selection.item.scale(1 + (event.scroll / 10));
                else if (hit && this.selection.item.data.type === "poly")
                {
                    this.polyStrokeWidth += event.scroll;
                    this.polyStrokeWidth = Math.max(this.polyStrokeWidth, 1)

                    if (this.polyBrush !== undefined)
                        this.polyBrush.remove()

                    this.polyBrush = new paper.Path.Circle({
                        center: point,
                        radius: this.polyStrokeWidth,
                        strokeColor: this.selection.item.strokeColor,
                    });
                    this.polyBrush.strokeWidth = this.strokeWidth
                }
            }
        }
    }

    /**
     * Delete current selection.
     */
    resetSelection() {

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

            return hit.item.name;
        }
        return undefined;
    }

    updateAnnotationType(unique_identifier, annotation_type, set_as_selected = true) {
        var item = this.getItemFromUUID(unique_identifier);

        if (item !== undefined) {

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
    }

    handleMouseDrag(event) {
        if (this.polyBrush !== undefined)
            this.polyBrush.remove()

        if (this.selection) {
            // Convert pixel to viewport coordinates
            var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

            // Convert from viewport coordinates to image coordinates.
            var imagePoint = new paper.Point(this.viewer.viewport.viewportToImageCoordinates(viewportPoint));

             

            switch (this.selection.item.data.type) {
                                                
                                
                case 'poly':
                    // if shift is pressed add circle diameter to poly
                    // else move poly

                    if(event.shift) {
                        var path = new paper.Path.Circle({
                            center: imagePoint,
                            radius: this.polyStrokeWidth,
                            strokeColor: 'red',
                        });
            
                        var result = this.selection.item.unite(path)
                        path.remove()

                        if (result.children === undefined) {
                            this.selection.item.remove()

                            this.selection.item = result
                        } else {
                            result.remove()
                        }

                    } else {
                        if (this.selection.type == 'new') {
                            this.selection.item.add(imagePoint);
                        }
                        else if (this.selection.type == 'fill') {

                            var tempRect = this.selection.item.bounds.clone();
                            tempRect.center = imagePoint;
        
                            if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                                this.selection.item.position = imagePoint;
                                
                        }
                        if (this.selection.type == 'segment') {
    
                            this.selection.segment.point = this.fixPointToImage(imagePoint);
                        }
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
        }

    }

    handleMousePress(event) {
        if (this.polyBrush !== undefined)
            this.polyBrush.remove()

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

            return hitResult.item.name;
        }

        return undefined;
    }

    handleMouseUp(event) {
        if (this.polyBrush !== undefined)
            this.polyBrush.remove()
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
