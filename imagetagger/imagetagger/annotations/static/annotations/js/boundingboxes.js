// JS file for bounding box internals

class BoundingBoxes {
    constructor(annotationTypeId, noSelection, viewer) {
        this.initialized = false;
        this.selection = undefined;
        this.vector_type = 1;
        if (globals.image === '') {
            globals.image = $('#image');
        }
        this.annotationTypeId = annotationTypeId;
        if (!noSelection) {
            this.initSelection();
        }

        this.viewer = viewer;
        this.overlay = this.viewer.paperjsOverlay();
        //this.hEl = viewer.HTMLelements();

    }

    drawAnnotation(annotation, update_view = false) {
        if (annotation.vector === null) {
            return;
        }

        // remove annotation in update case
        if (update_view){
            this.removeAnnotation(annotation.id)
        }

        var rect = new paper.Path.Rectangle(annotation.vector.x1, annotation.vector.y1,
            annotation.vector.x2 - annotation.vector.x1, annotation.vector.y2 - annotation.vector.y1);
        rect.fillColor = 'red'

        /*
        let border_size = 2;
        var boundingBox = document.createElement('div');
        boundingBox.setAttribute('class', 'boundingBox');
        boundingBox.setAttribute('id', 'boundingBox' + annotation.id);
        $(boundingBox).data('annotationid', annotation.id);
        $(boundingBox).css({'border': border_size + 'px solid ' + annotation.annotation_type.color_code});

        this.hEl.addElement({
            id: 'boundingBox' + annotation.id,
            element: boundingBox,
            x: annotation.vector.x1,
            y: annotation.vector.y1,
            width: annotation.vector.x2 - annotation.vector.x1,
            height: annotation.vector.y2 - annotation.vector.y1
        })

        if (update_view) {
            this.updateView()
        }*/
    }


    drawExistingAnnotations(annotations) {
        if (annotations.length === 0 || !globals.drawAnnotations) {
            return;
        }

        //this.hEl.removeAllElements();

        for (var a in annotations) {

            var annotation = annotations[a];
            //if (annotation.annotation_type.id !== this.annotationTypeId) {
            //  continue;
            //}
            if (annotation.vector === null) {
                continue;
            }

            this.drawAnnotation(annotation)
        }

        this.overlay.resize();
        this.overlay.resizecanvas();
        //this.updateView();
    }

    removeAnnotation(annotationid) {
        this.hEl.removeElementById('boundingBox' + annotationid);
    }

    updateView() {
        const currentZoom = this.viewer.viewport.getZoom(true) + 0.0001;
        const oldCenter = this.viewer.viewport.getCenter(true);
        this.viewer.viewport.zoomTo(currentZoom, oldCenter, true);
    }

    /**
     * Reload the selection.
     */
    reloadSelection(annotationId, annotationData) {
        if (!annotationData) {
            annotationData = {
                x1: parseInt($('#x1Field').val()),
                y1: parseInt($('#y1Field').val()),
                x2: parseInt($('#x2Field').val()),
                y2: parseInt($('#y2Field').val())
            };
        }
        let scaled_selection = {
            x1: annotationData.x1,
            y1: annotationData.y1,
            x2: annotationData.x2,
            y2: annotationData.y2
        };
        this.updateAnnotationFields(null, scaled_selection);

        $('#annotation_buttons').show();
    }

    /**
     * Delete current selection.
     */
    resetSelection(abortEdit) {
        $('.annotation_value').val(0);

        globals.editedAnnotationsId = undefined;
        $('.annotation').removeClass('alert-info');
        globals.editActiveContainer.addClass('hidden');
        $('#coordinate_table').hide();
        $('#annotation_buttons').hide();

        if (abortEdit){
            this.viewer.selectionInstance.cancel();
        }

    }

    /**
     * Update the contents of the annotation values
     *
     * @param img
     * @param selection
     */
    updateAnnotationFields(img, selection) {
        let not_in_image_cb = $('#not_in_image');
        if (not_in_image_cb.prop('checked')) {
            $('#not_in_image').prop('checked', false).change();
        }
        // Add missing fields
        let i = 1;
        for (; selection.hasOwnProperty("x" + i); i++) {
            if (!$('#x' + i + 'Field').length) {
                $('#coordinate_table').append(BoundingBoxes.getTag("x" + i)).append(BoundingBoxes.getTag("y" + i));
            }
        }
        // Remove unnecessary fields
        for (; $('#x' + i + 'Field').length; i++) {
            $('#x' + i + 'Box').remove();
            $('#y' + i + 'Box').remove();
        }
        $('#x1Field').val(Math.round(selection.x1));
        $('#y1Field').val(Math.round(selection.y1));
        $('#x2Field').val(Math.round(selection.x2));
        $('#y2Field').val(Math.round(selection.y2));
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

    clear() {

        for (let elem of this.hEl.getElements()) {
            this.viewer.canvas.removeChild(elem.element);
        }
        this.hEl.elements = [];
    }

    handleMouseDown(event) {
    }

    handleMouseUp(event) {

    }

    handleEscape() {
        this.resetSelection(true);
    }

    handleMouseClick(event) {
    }

    handleMousemove() {
    }
}
