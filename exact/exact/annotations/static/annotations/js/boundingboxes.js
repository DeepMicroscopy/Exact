// JS file for bounding box internals

class BoundingBoxes {
    constructor(viewer, imageid, imageSize) {
        this.viewer = viewer;
        this.current_item = undefined;

        this.overlay = this.viewer.paperjsOverlay();
        this.group = new paper.Group();

        this.hitOptionsObject = {
            segments: false,
            stroke: true,
            fill: true,
            tolerance: 2
        };


        var heatmap_cfg = { backgroundColor: 'rgba(0,0,0,0)', maxOpacity: 0.5, minOpacity: 0.25, zoom_threshold: 8}
        var heatmap_cfg_inv = { backgroundColor: 'rgba(0,0,0,0)', maxOpacity: 0.5, minOpacity: 0.25, inv: true, zoom_threshold: 8}
        
        this.heatmap = new HeatmapOverlay(this.viewer, heatmap_cfg);
        this.heatmap_inv = new HeatmapOverlay(this.viewer, heatmap_cfg_inv);
        this.group_heatmap = new paper.Group();
        this.group_heatmap_inv = new paper.Group();

        this.hitOptionsSegment = {};
        this.hitOptionsSegment['line'] = {
            segments: true,
            stroke: false,
            fill: false,
            tolerance: 5
        }
        this.hitOptionsSegment['multi_line'] = {
            segments: true,
            stroke: false,
            fill: false,
            tolerance: 2
        }
        this.hitOptionsSegment['poly'] = {
            segments: true,
            stroke: false,
            fill: false,
            tolerance: 2
        }
        this.hitOptionsSegment['fixed_rect'] = {
            segments: false,
            stroke: false,
            fill: false,
            tolerance: 2
        }
        this.hitOptionsSegment['rect'] = {
            segments: true,
            stroke: true,
            fill: false,
            tolerance: 5
        }



        this.imageid = imageid;
        this.image_width = imageSize["width"];
        this.image_hight = imageSize["height"];
        this.strokeWidth = 3;
        this.polyStrokeWidth = 1;

        this.singlePolyOperation = {
            active: false,
            mode: "",
            selected: undefined,
            image: undefined
        }

        this.multiPolyOperation = {
            active: false,
            mode: "",
            image: undefined
        }

        this.drag = {
            active: false,
            performed: false,
            segment: undefined,
            lastPos: undefined,
            fixPoint: undefined
        }

        this.resetSelection();
    }

    get selection() {
        return this.current_item;
    }

    set selection(item) {

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
                this.viewer.raiseEvent('tool_StopedAnnotationEditing', {});
            } else {
                let uuid = item.item.name;
                this.viewer.raiseEvent('tool_StartAnnotationEditing', { uuid });
            }
        } else if (this.current_item.item !== item.item) {
            this.current_item.item = item.item;
        }
    }

    clickPolyOperation(event) {
        if (this.tool.selection) {
            this.viewer.raiseEvent('boundingboxes_PolyOperation', { name: event.eventSource.name });
        }
    }

    activateSinglePolyOperation(event) {
        if (this.tool.current_item !== undefined && this.tool.current_item.type != "new" && this.tool.current_item.item._data.type == "poly") // we have a selection and it is no a new element
        {
            if (!this.tool.singlePolyOperation.active) // singlePolyOperation not active
            {
                if (this.tool.multiPolyOperation.active) {
                    this.tool.resetMultiPolyOperation()
                }

                this.tool.singlePolyOperation.active = true
                this.tool.singlePolyOperation.mode = event.eventSource.name
                this.tool.singlePolyOperation.selected = this.tool.current_item

                this.tool.singlePolyOperation.image = this.operatorActiveImgs[event.eventSource.name]
                this.tool.singlePolyOperation.image.style.visibility = 'visible'
            }
            else if (this.tool.singlePolyOperation.mode != event.eventSource.name) // singlePolyOperation active, but mode changed
            {
                this.tool.singlePolyOperation.mode = event.eventSource.name

                this.tool.singlePolyOperation.image.style.visibility = 'hidden'
                this.tool.singlePolyOperation.image = this.operatorActiveImgs[event.eventSource.name]
                this.tool.singlePolyOperation.image.style.visibility = 'visible'
            }
        }
    }

    activateSinglePolyOperationByString(mode, caller) {
        if (this.current_item !== undefined && this.current_item.type != "new" && this.current_item.item._data.type == "poly") {
            if (!this.singlePolyOperation.active) // singlePolyOperation not active
            {
                if (this.multiPolyOperation.active) {
                    this.resetMultiPolyOperation()
                }

                this.singlePolyOperation.active = true
                this.singlePolyOperation.mode = mode
                this.singlePolyOperation.selected = this.current_item

                this.singlePolyOperation.image = caller.operatorActiveImgs[mode]
                this.singlePolyOperation.image.style.visibility = 'visible'
            }
            else if (this.singlePolyOperation.mode != mode) // singlePolyOperation active, but mode changed
            {
                this.singlePolyOperation.mode = mode

                this.singlePolyOperation.image.style.visibility = 'hidden'
                this.singlePolyOperation.image = caller.operatorActiveImgs[mode]
                this.singlePolyOperation.image.style.visibility = 'visible'
            }
        }
    }

    resetSinglePolyOperation(event) {
        this.singlePolyOperation.active = false
        this.singlePolyOperation.mode = ""
        this.singlePolyOperation.selected = undefined

        if (this.singlePolyOperation.image != undefined) {
            this.singlePolyOperation.image.style.visibility = 'hidden'
            this.singlePolyOperation.image = undefined
        }
    }

    activateMultiPolyOperation(event) {
        if (this.viewer.selectionInstance.isSelecting && (this.tool.current_item == undefined || this.tool.current_item.type != "new")) // we have a selection and it is no a new element
        {
            if (!this.tool.multiPolyOperation.active) // multiPolyOperation not active
            {
                if (this.tool.singlePolyOperation.active) {
                    this.tool.resetSinglePolyOperation()
                }

                this.tool.multiPolyOperation.active = true
                this.tool.multiPolyOperation.mode = event.eventSource.name

                this.tool.multiPolyOperation.image = this.operatorActiveImgs[event.eventSource.name]
                this.tool.multiPolyOperation.image.style.visibility = 'visible'
            }
            else if (this.tool.multiPolyOperation.mode != event.eventSource.name) // multiPolyOperation active, but mode changed
            {
                this.tool.multiPolyOperation.mode = event.eventSource.name

                this.tool.multiPolyOperation.image.style.visibility = 'hidden'
                this.tool.multiPolyOperation.image = this.operatorActiveImgs[event.eventSource.name]
                this.tool.multiPolyOperation.image.style.visibility = 'visible'
            }
        }
    }

    activateMultiPolyOperationByString(mode, caller) {
        if (this.viewer.selectionInstance.isSelecting && (this.current_item == undefined || this.current_item.type != "new")) {
            if (!this.multiPolyOperation.active) // multiPolyOperation not active
            {
                if (this.singlePolyOperation.active) {
                    this.resetSinglePolyOperation()
                }

                this.multiPolyOperation.active = true
                this.multiPolyOperation.mode = mode

                this.multiPolyOperation.image = caller.operatorActiveImgs[mode]
                this.multiPolyOperation.image.style.visibility = 'visible'
            }
            else if (this.multiPolyOperation.mode != mode) // multiPolyOperation active, but mode changed
            {
                this.multiPolyOperation.mode = mode

                this.multiPolyOperation.image.style.visibility = 'hidden'
                this.multiPolyOperation.image = caller.operatorActiveImgs[mode]
                this.multiPolyOperation.image.style.visibility = 'visible'
            }
        }
    }

    resetMultiPolyOperation(event) {
        this.multiPolyOperation.active = false
        this.multiPolyOperation.mode = ""

        if (this.multiPolyOperation.image != undefined) {
            this.multiPolyOperation.image.style.visibility = 'hidden'
            this.multiPolyOperation.image = undefined
        }
    }

    findIncludedObjectsOperation() {
        var resultDict = { deleted: [], insert: [], update: [], included: [] }

        if (this.selection) {
            this.group.children.forEach(el => {
                if (el.intersects(this.selection.item) || this.selection.item.contains(el.firstSegment.point)) {
                    resultDict.included.push(el.name)
                }
            })
        }

        return resultDict
    }

    polyUnionOperation() {

        var resultDict = { deleted: [], insert: [], update: [], included: [] }
        var subOptions = { insert: false }
        var hit_children = []

        if (this.selection && this.selection.item.data.type === "poly") {

            var candidates = this.group.children.filter(el => el.data.type === "poly" &&
                el.data.type_id === this.selection.item.data.type_id &&
                el.name !== this.selection.item.name &&
                el.visible === true)

            candidates.forEach(el => {
                if (el.intersects(this.selection.item)) {
                    hit_children.push(el)
                }
                else if (this.selection.item.contains(el.firstSegment.point)) {
                    resultDict.deleted.push([el.name, true])
                }
            })

            var org_selection = this.selection.item.clone(subOptions)
            var modified = false

            hit_children.forEach(el => {
                let result = this.selection.item.unite(el, subOptions)
                // error occurce if the result can not represented as one poly
                if (result.children === undefined) {

                    this.selection.item.remove();
                    this.selection.item = result;

                    resultDict.deleted.push([el.name, true]);
                    modified = true
                }
            })

            if (modified) {
                this.group.addChild(this.selection.item)
                resultDict.update.push([this.selection.item.name, org_selection]);
            }

        }
        return resultDict
    }

    polyNotOperation() {

        // var operations = ['unite', 'intersect', 'subtract', 'exclude', 'divide'];
        var resultDict = { deleted: [], insert: [], update: [], included: [] }
        var subOptions = { insert: false }
        var hit_children = []

        if (this.selection) {

            var candidates = this.group.children.filter(el => el.name !== this.selection.item.name && el.visible)

            candidates.forEach(el => {
                // if intersects --> substract or divide
                if (el.intersects(this.selection.item)) {
                    hit_children.push(el)
                    // no intersection but one point is inside -> delete complete element
                } else if (this.selection.item.contains(el.firstSegment.point)) {
                    resultDict.deleted.push([el.name, true])
                }
            })

            hit_children.forEach(el => {
                var org_item = el.clone(subOptions)
                let result = el.subtract(this.selection.item, subOptions)

                if (result.children === undefined) {
                    if (Math.ceil(result.area) !== Math.ceil(el.area)) {
                        el.remove();
                        this.group.addChild(result)

                        resultDict.update.push([result.name, org_item])
                    }
                }
                else {
                    result.children.forEach(old_path => {
                        // add childs as new elements
                        var new_path = old_path.clone(subOptions)
                        new_path.data = old_path.parent.data
                        new_path.strokeColor = old_path.parent.strokeColor
                        new_path.strokeWidth = old_path.parent.strokeWidth
                        new_path.fillColor = old_path.parent.fillColor

                        new_path.name = this.uuidv4();
                        this.group.addChild(new_path);

                        resultDict.insert.push({
                            annotation_type: el.data.type_id,
                            id: -1,
                            vector: this.getAnnotationVector(new_path.name),
                            user: { id: null, username: "you" },
                            last_editor: { id: null, username: "you" },
                            image: this.imageid,
                            unique_identifier: new_path.name,
                            deleted: false
                        });
                    })

                    result.remove()
                    resultDict.deleted.push([el.name, true])

                }
            })
        }
        return resultDict;
    }

    polyScissorOperation() {
        var resultDict = { deleted: [], insert: [], update: [], included: [] }
        var subOptions = { insert: false }

        var org_selection = this.singlePolyOperation.selected.item.clone(subOptions)

        // check if the newly drawn polygon intersects the to-cut one
        // (modified_item is the original element that is going to be changed)
        // (current_item is the area that shall be cut from the modified item)
        if (this.singlePolyOperation.selected.item.intersects(this.current_item.item) == true) {
            // the polygons intersect
            let result = this.singlePolyOperation.selected.item.subtract(this.current_item.item, subOptions)

            if (result.children === undefined) {
                // the polygon is not cut into multiple pieces
                if (Math.ceil(result.area) !== Math.ceil(this.singlePolyOperation.selected.item.area)) {
                    // the area of the polygon changed
                    this.singlePolyOperation.selected.item.remove();
                    this.singlePolyOperation.selected.item = result
                    this.group.addChild(result)

                    resultDict.update.push([result.name, org_selection])
                }

                resultDict.deleted.push([this.selection.item.name, false])

                this.selection = this.singlePolyOperation.selected
                this.singlePolyOperation.selected = undefined

            } else {
                // the polygon is cut into multiple pieces

                for (var child_id = 0; child_id < result.children.length; child_id++) {
                    // add childs as new elements
                    var old_path = result.children[child_id]
                    var new_path = old_path.clone(subOptions)
                    new_path.data = old_path.parent.data
                    new_path.strokeColor = old_path.parent.strokeColor
                    new_path.strokeWidth = old_path.parent.strokeWidth
                    new_path.fillColor = old_path.parent.fillColor

                    new_path.name = this.uuidv4();
                    this.group.addChild(new_path);

                    resultDict.insert.push({
                        annotation_type: this.singlePolyOperation.selected.item.data.type_id,
                        id: -1,
                        vector: this.getAnnotationVector(new_path.name),
                        user: { id: null, username: "you" },
                        last_editor: { id: null, username: "you" },
                        image: this.imageid,
                        unique_identifier: new_path.name,
                        deleted: false
                    });

                }

                result.remove()

                resultDict.deleted.push([this.singlePolyOperation.selected.item.name, true])
                resultDict.deleted.push([this.selection.item.name, false])

                this.selection = undefined
                this.singlePolyOperation.selected = undefined
            }
        }
        else {
            resultDict.deleted.push([this.selection.item.name, false])

            this.selection = this.singlePolyOperation.selected
            this.singlePolyOperation.selected = undefined
        }

        return resultDict
    }

    polyGlueOperation() {
        var resultDict = { deleted: [], insert: [], update: [], included: [] }
        var subOptions = { insert: false }

        var org_selection = this.singlePolyOperation.selected.item.clone(subOptions)

        if (this.singlePolyOperation.selected.item.intersects(this.current_item.item) == true) {
            var result = this.singlePolyOperation.selected.item.unite(this.selection.item, subOptions)
            // error occurce if the result can not represented as one poly
            if (result.children === undefined) {

                this.singlePolyOperation.selected.item.remove();
                this.singlePolyOperation.selected.item = result;
                this.group.addChild(result)

                resultDict.deleted.push([this.selection.item.name, false]);
                resultDict.update.push([this.singlePolyOperation.selected.item.name, org_selection]);

                this.selection = this.singlePolyOperation.selected
                this.singlePolyOperation.selected = undefined
            }
            else {
                result.remove()
                resultDict.deleted.push([this.selection.item.name, false])

                this.selection = this.singlePolyOperation.selected
                this.singlePolyOperation.selected = undefined
            }
        }
        else {
            resultDict.deleted.push([this.selection.item.name, false])

            this.selection = this.singlePolyOperation.selected
            this.singlePolyOperation.selected = undefined
        }

        return resultDict
    }

    polyKnifeOperation() {
        // https://stackoverflow.com/questions/23258001/slice-path-into-two-separate-paths-using-paper-js
        // modificated to be more robust 
        const splitUsingPath = (target, path) => {
            const paths = [path.clone({ insert: false })];
            const targets = [target.clone({ insert: false })];

            const intersections = path.getIntersections(target)

            var p1
            var p2

            if (intersections.length < 2) {
                // Nothing to do here
                return [targets, paths]
            }
            else if (intersections.length == 2) {
                // check if the line starts and ends within the poly
                if (intersections[0].point.getDistance(path.segments[0].point) < 1.0) {
                    return [targets, paths]
                }
                else if (targets[0].contains(path.segments[0].point) && path.segments[0].point.getDistance(target.getNearestLocation(path.segments[0].point).point) > 0.01) {
                    return [targets, paths]
                }
                else {
                    p1 = intersections[0]
                    p2 = intersections[1]
                }
            }
            else {
                // check if the line starts within the poly
                if (intersections[0].point.getDistance(path.segments[0].point) < 0.01) {
                    // nessesary due to floating point inaccuraccy in the "contains" calculation 
                    p1 = intersections[1]
                    p2 = intersections[2]
                }
                else if (targets[0].contains(path.segments[0].point) && path.segments[0].point.getDistance(target.getNearestLocation(path.segments[0].point).point) > 0.01) {
                    // the line starts in the poly
                    // ignore the first intersection
                    p1 = intersections[1]
                    p2 = intersections[2]

                }
                else {
                    p1 = intersections[0]
                    p2 = intersections[1]
                }
            }

            var points = [p1, p2]

            points.forEach(location => {
                const offset = targets[0].getOffsetOf(location.point)
                const pathLocation = targets[0].getLocationAt(offset)
                const newTarget = targets[0].splitAt(pathLocation)
                const isNew = newTarget !== targets[0]

                if (isNew) {
                    targets.push(newTarget)
                }

                paths.forEach(path => {
                    const offset = path.getOffsetOf(location.point)
                    const pathLocation = path.getLocationAt(offset)

                    if (pathLocation) {
                        paths.push(path.splitAt(pathLocation))
                    }
                })
            })

            // TODO maybe find more robust solution
            const innerPath = paths[1]
            //const innerPath = paths.find(p => target.contains(p.bounds.center))

            var result_paths = paths.filter(path => path.id != innerPath.id)

            targets.forEach((target, i) => {
                const isFirst = i === 0
                const innerPathCopy = isFirst ? innerPath : innerPath.clone()

                target.join(innerPathCopy, innerPathCopy.length)
                target.closed = true
            })

            return [targets, result_paths]
        }

        var resultDict = { deleted: [], insert: [], update: [], included: [] }
        if (this.selection) {
            var subOptions = { insert: false }

            var hit_children = []
            for (var i = 0; i < this.group.children.length; i++) {
                var el = this.group.children[i]

                // just work on saved annotations
                if (el.name !== this.selection.item.name && el.visible === true && el.data.type == 'poly') {

                    // if intersects --> divide
                    if (el.intersects(this.selection.item) === true) {
                        hit_children.push(el)
                    }
                }
            }

            hit_children.forEach(el => {
                var org_line = this.selection.item.clone({ insert: false })

                org_line.segments.forEach(seg => {
                    var dist = seg.point.getDistance(el.getNearestLocation(seg.point).point)
                    if (dist < 1.0) {
                        seg.remove()
                    }
                })

                var result = splitUsingPath(el, org_line)

                var polys = result[0]
                var lines = result[1]

                for (var n = 0; n < polys.length; n++) {
                    var poly = polys[n]
                    for (var m = 0; m < lines.length; m++) {
                        var line = lines[m]

                        var new_res = splitUsingPath(poly, line)

                        if (new_res[0].length == 2) {
                            poly.remove()
                            polys.splice(n, 1)
                            polys.push(new_res[0][0])
                            polys.push(new_res[0][1])

                            line.remove()
                            lines.splice(m, 1)
                            lines.push(new_res[1][0])
                            lines.push(new_res[1][1])

                            n = 0
                            m = 0
                            break
                        }

                    }
                }

                for (var id = 0; id < polys.length; id++) {
                    var old_path = polys[id]
                    var new_path = old_path.clone(subOptions)
                    new_path.data = old_path.data
                    new_path.strokeColor = old_path.strokeColor
                    new_path.strokeWidth = old_path.strokeWidth
                    new_path.fillColor = old_path.fillColor

                    new_path.name = this.uuidv4();
                    this.group.addChild(new_path);

                    resultDict.insert.push({
                        annotation_type: el.data.type_id,
                        id: -1,
                        vector: this.getAnnotationVector(new_path.name),
                        user: { id: null, username: "you" },
                        last_editor: { id: null, username: "you" },
                        image: this.imageid,
                        unique_identifier: new_path.name,
                        deleted: false
                    });

                    polys[id].remove()
                    lines[id].remove()
                }

                org_line.remove()
                resultDict.deleted.push([el.name, true])
            })

            resultDict.deleted.push([this.selection.item.name, false])
        }
        return resultDict;
    }

    uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
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
        var selection_hit_type = 'new';
        switch (selected_annotation_type.vector_type) {
            case 2:  // POINT or Elipse
                var rectangle = new paper.Rectangle(imagePoint,
                    new paper.Size(selected_annotation_type.default_width, selected_annotation_type.default_height));
                canvasObject = new paper.Shape.Ellipse(rectangle);
                canvasObject.position = imagePoint;
                canvasObject.data.type = "circle";

                break;

            case 3:  // Line
                canvasObject = new paper.Path(imagePoint);
                canvasObject.data.type = "line";

                break;

            case 4:  // MULTI_LINE
                canvasObject = new paper.Path(imagePoint);
                canvasObject.data.type = "multi_line";

                break;
            case 5:  // POLYGON
                var canvasObject = new paper.Path({
                    closed: selected_annotation_type.closed,
                });
                canvasObject.add(imagePoint);
                canvasObject.data.type = "poly";
                break;

            case 1:  // Rect
                canvasObject = new paper.Path.Rectangle(imagePoint,
                    new paper.Size(selected_annotation_type.default_width, selected_annotation_type.default_height));
                canvasObject.position = imagePoint;
                canvasObject.data.type = "rect";

                break;
            case 6:
            default:
                canvasObject = new paper.Path.Rectangle(imagePoint,
                    new paper.Size(selected_annotation_type.default_width, selected_annotation_type.default_height));
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

        canvasObject.fillColor = selected_annotation_type.color_code
        canvasObject.fillColor.alpha = $('#OpacitySlider')[0].value


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
            user: { id: null, username: "you" },
            last_editor: { id: null, username: "you" },
            image: this.imageid,
            unique_identifier: canvasObject.name,
            deleted: false
        }
    }

    drawAnnotation(annotation) {
        if (annotation.vector === null || annotation.deleted) {
            return;
        }

        var opacity = $('#OpacitySlider')[0].value
        var mem_ids = {}

        switch (annotation.annotation_type.vector_type) {
            case 1:  // Rect
                var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);

                rect.strokeColor = annotation.annotation_type.color_code;
                rect.strokeWidth = this.strokeWidth;
                var alpha = 1;
                if (annotation.generated)
                {
                rect.dashArray = [4, 2];
                if ($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin).length>0)
                {
                  alpha = parseInt($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin)[0].value)/100
                }
                }
                
                rect.strokeColor.alpha = alpha
                rect.name = annotation.unique_identifier;
                rect.fillColor = annotation.annotation_type.color_code
                rect.fillColor.alpha = opacity

                rect.data.type = "rect";
                rect.data.type_id = annotation.annotation_type.id;
                var checkbox = $('#DrawCheckBox_' + annotation.annotation_type.id)[0]
                if (annotation.generated)
                {
                    rect.data.area_hit_test = false;
                    rect.locked = true;
                }
                else
                {
                    rect.data.area_hit_test = annotation.annotation_type.area_hit_test;
                    rect.locked = checkbox.indeterminate;
                }
                rect.visible = checkbox.checked; // only non-generated annotations are hidden by clicking the annotation type


                this.group.addChild(rect);
                break;


            case 6:
            case 7:
                var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);

                rect.strokeColor = annotation.annotation_type.color_code;
                rect.strokeWidth = this.strokeWidth;
                if (annotation.generated)
                {
                rect.dashArray = [4, 1];
                }
                rect.name = annotation.unique_identifier;
                rect.fillColor = annotation.annotation_type.color_code
                rect.fillColor.alpha = opacity

                rect.data.type = "fixed_rect";
                rect.data.type_id = annotation.annotation_type.id;

                var checkbox = $('#DrawCheckBox_' + annotation.annotation_type.id)[0]
                var alpha = 1;
                

                if (annotation.generated)
                {
                    rect.data.area_hit_test = false;
                    rect.locked = true;
                    if ($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin).length>0)
                    {
                      alpha = parseInt($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin)[0].value)/100
                    }
                }
                else
                {
                    rect.data.area_hit_test = annotation.annotation_type.area_hit_test;
                    rect.locked = checkbox.indeterminate;
                }
                rect.visible = checkbox.checked;
                rect.strokeColor.alpha = alpha

                this.group.addChild(rect);
                break;

            case 2:  // POINT or Elipse
                var rectangle = new paper.Rectangle(annotation.vector.x1, annotation.vector.y1,
                    annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);
                var ellipse = new paper.Shape.Ellipse(rectangle);

                ellipse.strokeColor = annotation.annotation_type.color_code;
                ellipse.strokeWidth = this.strokeWidth;
                if (annotation.generated)
                {
                    ellipse.dashArray = [4, 2];
                }
                ellipse.name = annotation.unique_identifier;
                ellipse.fillColor = annotation.annotation_type.color_code
                ellipse.fillColor.alpha = opacity


                ellipse.data.type = "circle";
                ellipse.data.type_id = annotation.annotation_type.id;

                var checkbox = $('#DrawCheckBox_' + annotation.annotation_type.id)[0]
                var alpha = 1
                if (annotation.generated)
                {
                    ellipse.data.area_hit_test = false;
                    ellipse.locked = true;
                    if ($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin).length>0)
                    {
                      alpha = parseInt($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin)[0].value)/100
                    }
                }
                else
                {
                    ellipse.data.area_hit_test = annotation.annotation_type.area_hit_test;
                    ellipse.locked = checkbox.indeterminate;
                }
                ellipse.visible = checkbox.checked;                    
                ellipse.strokeColor.alpha = alpha

                this.group.addChild(ellipse);
                break;

            case 3:  // Line
                var line = new paper.Path.Line(new paper.Point(annotation.vector.x1, annotation.vector.y1),
                    new paper.Point(annotation.vector.x2, annotation.vector.y2));

                line.strokeColor = annotation.annotation_type.color_code;
                line.strokeWidth = this.strokeWidth;
                line.name = annotation.unique_identifier;
                line.fillColor = annotation.annotation_type.color_code
                line.fillColor.alpha = opacity
                if (annotation.generated)
                {
                line.dashArray = [4, 2];
                }

                line.data.type = "line";
                line.data.type_id = annotation.annotation_type.id;

                var checkbox = $('#DrawCheckBox_' + annotation.annotation_type.id)[0]
                var alpha = 1
                if (annotation.generated)
                {
                    line.data.area_hit_test = false;
                    line.locked = true;
                    if ($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin).length>0)
                    {
                      alpha = parseInt($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin)[0].value)/100
                    }
                }
                else
                {
                    line.data.area_hit_test = annotation.annotation_type.area_hit_test;
                    line.locked = checkbox.indeterminate;
                }
                line.visible = checkbox.checked;
                line.strokeColor.alpha = alpha


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

                poly.fillColor = annotation.annotation_type.color_code
                poly.fillColor.alpha = opacity

                var alpha = 1
                if (annotation.generated)
                {
                poly.dashArray = [4, 1];
                if ($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin).length>0)
                {
                  alpha = parseInt($('#alpha-plugin-'+annotation.pluginresultentry.pluginresult.plugin)[0].value)/100
                }
                }
                poly.strokeColor.alpha=alpha

                poly.data.type = "poly";
                poly.data.type_id = annotation.annotation_type.id;

                var count = Object.keys(annotation.vector).length / 2;
                for (var i = 1; i <= count; i++) {
                    poly.add(new paper.Point(annotation.vector["x" + i], annotation.vector["y" + i]));
                }

                var checkbox = $('#DrawCheckBox_' + annotation.annotation_type.id)[0]
                poly.visible = checkbox.checked
                if (annotation.generated)
                {
                    poly.data.area_hit_test = false;
                    poly.locked = true;
                }
                else
                {
                    poly.data.area_hit_test = annotation.annotation_type.area_hit_test;
                    poly.locked = checkbox.indeterminate;
                }
                poly.visible = checkbox.checked;

                this.group.addChild(poly);
                break;
        }
    }

    updateAnnotationVisibility(unique_identifier, visibility) {
        var item = this.getItemFromUUID(unique_identifier);
        var opacity = $('#OpacitySlider')[0].value

        if (item !== undefined) {
            if (visibility === true) {
                item.fillColor.alpha = opacity
            }
            else if (visibility === false) {
                item.fillColor.alpha = 0
            }


            item.visible = visibility;
        }
    }

    updateAnnotationAlpha(unique_identifier, alpha) {
        var item = this.getItemFromUUID(unique_identifier);

        if (item !== undefined) {
            item.strokeColor.alpha = alpha
        }
    }    

    updateVisbility(annotation_type_id, visibility, disabled_hitTest = false, keep_interaction = false) {
        var opacity = $('#OpacitySlider')[0].value

        this.group.children.filter(function (el) { return el.data.type_id === parseInt(annotation_type_id) })
            .forEach(function (el) {
                if (visibility === true) {
                    el.fillColor.alpha = opacity
                    el.strokeColor.alpha = 1.0
                }
                else if (visibility === false) {
                    if (keep_interaction) {
                        el.fillColor.alpha = 0.01
                        el.strokeColor.alpha = 0.01
                    }
                    else {
                        el.fillColor.alpha = 0
                    }
                }

                if (keep_interaction) {
                    el.visible = true
                }
                else {
                    el.visible = visibility;
                }

                el.locked = disabled_hitTest

            });
    }

    pushAnnoTypeToBackground(annotation_type_id) {
        this.group.children.forEach(el => {
            if (el.data.type_id == annotation_type_id) {
                el.sendToBack()
            }
        })
    }

    updateAnnotations(annotations) {
        if (annotations === undefined ||
            annotations.length === 0) {

            return;
        }

        for (var annotation of annotations) {

            let item = this.getItemFromUUID(annotation.unique_identifier)

            if (annotation.vector === null || item === undefined) {
                continue;
            } else {
                this.removeAnnotation(annotation.unique_identifier)
            }

            this.drawAnnotation(annotation)
        }

        this.overlay.resize();
        this.overlay.resizecanvas();
    }


    drawHeatmap(annotations, inv = false) {
        if (annotations === undefined) {
            return;
        }

        for (var anno_hm of annotations) {
            if (anno_hm.vector === null || this.getItemFromUUID(anno_hm.unique_identifier) !== undefined) {
                continue;
            }
        }

        var hs_intensity = 1;
        var points = [];
        var max = 0;

        for (var anno_hm of annotations) {

            let anno_width = anno_hm.vector.x2 - anno_hm.vector.x1;
            let anno_height = anno_hm.vector.y2 - anno_hm.vector.y1
            let hs_radius =  Math.max(anno_width, anno_height, 10); // Sets the radius to object size or at least 10 pixels. 

            var x_pos = anno_hm.vector.x1 + (anno_width / 2);
            var y_pos = anno_hm.vector.y1 + (anno_height / 2);
            var point = {
                x: x_pos,
                y: y_pos,
                value: hs_intensity,
                radius: hs_radius
            };
            points.push(point);
        }
        var data = {
            max: max,
            data: points
        };

        var heatmap_data = data

        if (inv) {
            this.group_heatmap_inv.addChild(this.heatmap_inv.setData(heatmap_data));
        }            
        else {
            this.group_heatmap.addChild(this.heatmap.setData(heatmap_data));
        }


        this.overlay.resize();
        this.overlay.resizecanvas();
    }

    drawExistingAnnotations(annotations, drawAnnotations = true) {
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

    updateStrokeWidth(width) {
        if (width !== null)
            this.strokeWidth = width;
        else {
            // set stroke width to one percent of the visibile size
            var bounds = this.viewer.viewport.getBounds(true);
            var imageRect = this.viewer.viewport.viewportToImageRectangle(bounds);

            width = Math.max(imageRect.width, imageRect.height) * 0.0025;
            width = Math.max(1, width);
            this.strokeWidth = width;
        }

        this.group.children.forEach(x => { x.strokeWidth = this.strokeWidth });
    }

    updateOpacity(opacity) {
        if (opacity != null) {
            this.group.children.forEach(el => el.fillColor.alpha = opacity)
        }
    }

    showItem(annotation) {
        if (annotation === undefined)
            return
        var item = this.getItemFromUUID(annotation.unique_identifier);
        // if annotation was found zoom to annotation
        if (item !== undefined) {
            const vpRect = this.viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(
                item.bounds.topLeft.x - 2 * item.bounds.width,
                item.bounds.topLeft.y - 2 * item.bounds.height,
                item.bounds.width + 2 * item.bounds.width,
                item.bounds.height + 2 * item.bounds.height
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
            if (this.selection.item.data.type !== "fixed_rect") {
                // Convert pixel to viewport coordinates
                var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

                // Convert from viewport coordinates to image coordinates.
                var point = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

                var hit = this.hitTestObject(point, this.hitOptionsObject);
                if (hit && this.selection.item.data.type !== "poly") // just resize if mouse is over element
                    this.selection.item.scale(1 + (event.scroll / 10));
                else if (hit && this.selection.item.data.type === "poly") {
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

    hitTestObject(point) {
        var hits = this.group.hitTestAll(point, this.hitOptionsObject);
        hits = hits.filter(el => el.type != "fill" || (el.type == "fill" && el.item.data.area_hit_test))
        if (hits.length > 0) {
            if (this.selection == undefined) {
                // Currently there is no element selected
                // Select first visible element
                for (var i = 0; i < hits.length; i++) {
                    if (hits[i].item.visible == true && hits[i].item.children == undefined) {
                        return hits[i]
                    }
                }
            }
            else {
                // Some element is already selected
                // Check if the current selection is within the hits
                var contains = false
                var idx = 0
                for (; idx < hits.length; idx++) {
                    if (hits[idx].item.name == this.selection.item.name) {
                        idx++
                        contains = true
                        break
                    }
                }

                if (contains == false) {
                    // If it is not contained, return the first visible item
                    for (var i = 0; i < hits.length; i++) {
                        if (hits[i].item.visible == true && hits[i].item.children == undefined) {
                            return hits[i]
                        }
                    }
                }
                else {
                    // Else, return the element that is after the selected on in the list
                    // Run trough the rest of the list to find the first, visible element
                    for (; idx < hits.length; idx++) {
                        if (hits[idx].item.visible == true && hits[idx].item.children == undefined) {
                            return hits[idx]
                        }
                    }
                    // If there is no visible element in the later part of the list, re-start from the beginning
                    for (var i = 0; i < hits.length; i++) {
                        if (hits[i].item.visible == true && hits[i].item.children == undefined) {
                            return hits[i]
                        }
                    }
                }


            }
        }
        return undefined;
    }

    hitTestObject_s(point)
    {
        // return the smallest clicked object
        var hits = this.group.hitTestAll(point, this.hitOptionsObject);
        if (hits.length > 0)
        {
            hits.sort((a,b) => (Math.abs(a.item.area) > Math.abs(b.item.area)) ? 1 : -1)
            return hits[0]
        }
        else
        {
            return undefined
        }
    }

    hitTestSegment(point) {
        if (this.selection !== undefined) {
            var hits = this.group.hitTestAll(point, this.hitOptionsSegment[this.selection.item.data.type])

            for (var i = 0; i < hits.length; i++) {
                if (hits[i].item.visible && hits[i].item.name == this.selection.item.name) {
                    return hits[i]
                }
            }
        }

        return undefined
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

        canvasObject.fillColor = annotation_type.color_code
        canvasObject.fillColor.alpha = $('#OpacitySlider')[0].value


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
                    if (event.shift) {
                        // brush mode
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

                        this.drag.performed = true
                    }
                    else {
                        if (this.selection.type == 'new') {
                            // polygon is still drawn
                            this.selection.item.add(imagePoint);
                        }
                        else if (this.drag.active) {
                            // a segment is moved
                            this.drag.segment.segment.point = this.fixPointToImage(imagePoint)
                            this.drag.performed = true
                        }
                        else if (this.selection.item.contains(imagePoint) || this.drag.performed) {
                            // move the polygon
                            var x_diff = imagePoint.x - this.drag.lastPos.x
                            var y_diff = imagePoint.y - this.drag.lastPos.y

                            var tempRect = this.selection.item.bounds.clone();
                            tempRect.center.x += x_diff;
                            tempRect.center.y += y_diff;

                            if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                                // ensure we dont move our polygon out of bounds
                                this.selection.item.position = tempRect.center;

                            this.drag.performed = true
                            this.drag.lastPos = imagePoint
                        }
                    }
                    break;

                case 'line':

                    if (this.selection.item.segments.length == 1) {
                        this.selection.item.add(imagePoint);
                        this.drag.active = true
                        this.drag.segment = this.hitTestSegment(imagePoint)
                    }
                    else {
                        if (this.drag.active) {
                            // a segment is moved
                            this.drag.segment.segment.point = this.fixPointToImage(imagePoint)
                            this.drag.performed = true
                        }
                        else {
                            // the whole line is moved
                            var x_diff = imagePoint.x - this.drag.lastPos.x
                            var y_diff = imagePoint.y - this.drag.lastPos.y
                            this.selection.item.position.x += x_diff
                            this.selection.item.position.y += y_diff

                            this.drag.lastPos = imagePoint
                        }
                        this.drag.performed = true
                    }
                    break;

                case 'multi_line':
                    if (this.selection.type == 'new') {
                        // line is still drawn
                        this.selection.item.add(imagePoint);
                    }
                    else if (this.drag.active) {
                        // a segment is moved
                        this.drag.segment.segment.point = this.fixPointToImage(imagePoint)
                        this.drag.performed = true
                    }
                    else {
                        // the whole line is moved
                        var x_diff = imagePoint.x - this.drag.lastPos.x
                        var y_diff = imagePoint.y - this.drag.lastPos.y
                        this.selection.item.position.x += x_diff
                        this.selection.item.position.y += y_diff

                        this.drag.lastPos = imagePoint
                        this.drag.performed = true
                    }

                    break;

                case 'fixed_rect':

                    if (this.selection.item.contains(imagePoint) || this.drag) {
                        var x_diff = imagePoint.x - this.drag.lastPos.x
                        var y_diff = imagePoint.y - this.drag.lastPos.y

                        var tempRect = this.selection.item.bounds.clone();
                        tempRect.center.x += x_diff;
                        tempRect.center.y += y_diff;

                        if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                            // ensure we dont move our polygon out of bounds
                            this.selection.item.position = tempRect.center;

                        this.drag.performed = true
                        this.drag.lastPos = imagePoint
                    }

                    break;

                default:

                    if (this.drag.active) {
                        if (this.drag.fixPoint == undefined) {
                            var seg = undefined

                            if (this.drag.segment.type == "stroke") {
                                seg = this.drag.segment.location.segment
                            }
                            else {
                                seg = this.drag.segment.segment
                            }

                            var idx_a = seg.index
                            var idx_b = (idx_a + 2 > 3) ? (idx_a - 2) : (idx_a + 2)
                            this.drag.fixPoint = this.drag.segment.item.segments[idx_b].point.clone()
                        }

                        var topLeft = this.fixPointToImage(imagePoint);

                        var min_x
                        var max_x
                        var min_y
                        var max_y

                        if (topLeft.x > this.drag.fixPoint.x) {
                            min_x = this.drag.fixPoint.x
                            max_x = topLeft.x

                            if (max_x - min_x < 10)
                                max_x = min_x + 10
                        }
                        else {
                            min_x = topLeft.x
                            max_x = this.drag.fixPoint.x

                            if (max_x - min_x < 10)
                                min_x = max_x - 10
                        }

                        if (topLeft.y > this.drag.fixPoint.y) {
                            min_y = this.drag.fixPoint.y
                            max_y = topLeft.y

                            if (max_y - min_y < 10)
                                max_y = min_y + 10
                        }
                        else {
                            min_y = topLeft.y
                            max_y = this.drag.fixPoint.y

                            if (max_y - min_y < 10)
                                min_y = max_y - 10
                        }

                        this.selection.item.bounds = new paper.Rectangle(new paper.Point(min_x, min_y), new paper.Point(max_x, max_y));

                        this.drag.performed = true

                    }
                    else if (this.selection.item.contains(imagePoint) || this.drag.performed) {
                        // the rect is moved
                        var x_diff = imagePoint.x - this.drag.lastPos.x
                        var y_diff = imagePoint.y - this.drag.lastPos.y

                        var tempRect = this.selection.item.bounds.clone();
                        tempRect.center.x += x_diff;
                        tempRect.center.y += y_diff;

                        if (this.isPointInImage(tempRect.getTopLeft()) && this.isPointInImage(tempRect.getBottomRight()))
                            // ensure we dont move our polygon out of bounds
                            this.selection.item.position = tempRect.center;

                        this.drag.performed = true
                        this.drag.lastPos = imagePoint
                    }

                    break;
            }
        }

    }

    handleSelection(event, hitResult) {
        if (this.polyBrush !== undefined)
            this.polyBrush.remove()

        // Convert pixel to viewport coordinates
        var viewportPoint = this.viewer.viewport.pointFromPixel(event.position);

        // Convert from viewport coordinates to image coordinates.
        var point = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

        //var hitResult = this.group.hitTest(point, this.hitOptions);
        //var hitResult = this.hitTest(point)

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


            //if (!event.originalEvent.shiftKey) {
            //    // if poly add new handling point
            //    if (this.selection.type == 'stroke' &&
            //        this.selection.item.data.type == 'poly' &&
            //        this.selection.item.segments.length > 3) {
            //        var location = this.selection.location;
            //        if (this.selection.location !== undefined) {
            //            this.selection.item.insert(location.index + 1, point);
            //        }
            //    }
            //} else {
            //    // or remove point
            //    if (this.selection.item.data.type == "poly") {
            //        if (hitResult.type == 'segment' && this.selection.item.segments.length > 2) {
            //            hitResult.segment.remove();
            //        }
            //    }
            //}

            return hitResult;
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
