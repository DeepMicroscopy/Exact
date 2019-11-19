globals = {
    editedAnnotationsId: undefined,
    editActiveContainer: {},
    drawAnnotations: true,
    allAnnotations: undefined,
};


(function () {
    const API_ANNOTATIONS_BASE_URL = '/annotations/api/';
    const API_IMAGES_BASE_URL = '/images/api/';
    const FEEDBACK_DISPLAY_TIME = 3000;
    const ANNOTATE_URL = '/annotations/%s/';
    const IMAGE_SET_URL = '/images/imageset/%s/';
    const PRELOAD_BACKWARD = 2;
    const PRELOAD_FORWARD = 5;
    const STATIC_ROOT = '/static/';

    // TODO: Find a solution for url resolvings

    var gCsrfToken;
    var gHeaders;
    var gHideFeedbackTimeout;
    var gImageId;
    var gImageSetId;
    var gImageList;
    let gAnnotationType = -1;
    let gAnnotationCache = {};

    var gShiftDown;

    // a threshold for editing an annotation if you select a small rectangle
    var gSelectionThreshold = 5;

    // save the current annotations of the image, so we can draw and hide the

    var tool;
    var selection;
    var viewer = OpenSeadragon({
        id: "openseadragon1",
        prefixUrl: '../../static/images/',
        showNavigator: true,
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        //minZoomLevel: 1,
        visibilityRatio: 1,
        zoomPerScroll: 2,
        timeout: 120000,
    });
    viewer.gestureSettingsMouse.clickToZoom = false;

    viewer.addHandler("open", function () {
        // To improve load times, ignore the lowest-resolution Deep Zoom
        // levels.  This is a hack: we can't configure the minLevel via
        // OpenSeadragon configuration options when the viewer is created
        // from DZI XML.
        //viewer.source.minLevel = 8;
    });

    /*
       confirm selection
     */
    viewer.addHandler("selection", function (data) {

        createAnnotation(undefined, undefined, reload_list=false, data);
    });


    selection = viewer.selection({
        allowRotation: false,
        restrictToImage: true,
        //showConfirmDenyButtons: false
    });

    function shorten(string, length) {
        let threshold = length || 30;
        if (string.length < threshold) {
            return string;
        } else {
            return string.substr(0, threshold / 2 - 1) + '...' + string.substr(-threshold / 2 + 2, threshold / 2 - 2);
        }
    }

    function initTool() {
        setTool();
        loadAnnotateView(gImageId);
    }

    function setTool() {

        let vector_type = -1;
        let node_count = 0;
        let annotationTypeId = 0;
        let selected_annotation = null;

        if ($('#annotation_type_id').children().length > 0) {
            let selected_annotation = $('#annotation_type_id').children(':selected').data();
            vector_type = selected_annotation.vectorType;
            node_count = selected_annotation.nodeCount;
            annotationTypeId = parseInt($('#annotation_type_id').children(':selected').val());
        }

        if (tool && tool.annotationTypeId === annotationTypeId) {
            // Tool does not have to change
            return;
        }

        if (typeof globals.editedAnnotationsId != "undefined") {
            anno = globals.allAnnotations.find(function (e) {
                return e.id == globals.editedAnnotationsId
            })
            createAnnotation(undefined, undefined, reload_list = False, undefined);
        }

        if (tool) {
            delete tool;
        }
        $('#feedback_multiline_information').addClass('hidden');
        switch (vector_type) {
            case 1: // Bounding Box
                    // Remove unnecessary number fields
                for (let i = 3; $('#x' + i + 'Field').length; i++) {
                    $('#x' + i + 'Box').remove();
                    $('#y' + i + 'Box').remove();
                }
                tool = new BoundingBoxes(annotationTypeId, true, viewer);
                break;
            case 4: // Multiline, fallthrough
                $('#feedback_multiline_information').removeClass('hidden');
            case 2: // Point, fallthrough
            case 3: // Line, fallthrough
            case 5: // Polygon
                break;
            default:
                // Dummytool
                tool = {
                    initSelection: function () {
                    },
                    resetSelection: function () {
                    },
                    restoreSelection: function () {
                    },
                    cancelSelection: function () {
                    },
                    reset: function () {
                    },
                    drawExistingAnnotations: function () {
                    },
                    handleEscape: function () {
                    },
                    handleMousemove: function () {
                    },
                    handleMouseDown: function () {
                    },
                    handleMouseUp: function () {
                    },
                    handleMouseClick: function () {
                    },
                    moveSelectionLeft: function () {
                    },
                    moveSelectionRight: function () {
                    },
                    moveSelectionUp: function () {
                    },
                    moveSelectionDown: function () {
                    },
                    decreaseSelectionSizeFromRight: function () {
                    },
                    decreaseSelectionSizeFromTop: function () {
                    },
                    increaseSelectionSizeRight: function () {
                    },
                    increaseSelectionSizeUp: function () {
                    },
                    setHighlightColor: function () {
                    },
                    unsetHighlightColor: function () {
                    }
                };
        }
        if (globals.allAnnotations) {
            tool.drawExistingAnnotations(globals.allAnnotations);
        }
        console.log("Using tool " + tool.constructor.name);
    }


    /**
     * Create an annotation using the form data from the current page.
     * If an annotation is currently edited, an update is triggered instead.
     *
     * @param event
     * @param successCallback a function to be executed on success
     * @param markForRestore
     */
    function createAnnotation(event, successCallback, reload_list, data) {

        var annotationTypeId = parseInt($('#annotation_type_id').val());
        if (annotationTypeId == -1) {
            if (typeof(successCallback) === "function") {
                successCallback();
                return;
            }
            displayFeedback($('#feedback_annotation_type_missing'));
            return;
        }

        var vector = null;

        if (isNaN(annotationTypeId)) {
            displayFeedback($('#feedback_annotation_type_missing'));
            return;
        }

        let blurred = $('#blurred').is(':checked');
        let concealed = $('#concealed').is(':checked');
        if (!$('#not_in_image').is(':checked')) {
            vector = {};
            if (data instanceof OpenSeadragon.Rect) {
                vector["x1"] = data.x;
                vector["x2"] = data.x + data.width;
                vector["y1"] = data.y;
                vector["y2"] = data.y + data.height;
            } else {
                for (let i = 1; $('#x' + i + 'Field').length; i++) {
                    vector["x" + i] = parseInt($('#x' + i + 'Field').val());
                    vector["y" + i] = parseInt($('#y' + i + 'Field').val());
                }
            }
        }

        let selected_annotation = $('#annotation_type_id').children(':selected').data();
        let vector_type = selected_annotation.vectorType;
        let node_count = selected_annotation.nodeCount;
        if (!validate_vector(vector, vector_type, node_count)) {
            if (typeof(successCallback) === "function") {
                successCallback();
                return;
            }
        }

        var action = 'create';
        var data = {
            annotation_type_id: annotationTypeId,
            image_id: gImageId,
            vector: vector,
            concealed: concealed,
            blurred: blurred
        };
        var editing = false;
        if (globals.editedAnnotationsId !== undefined) {
            // edit instead of create
            action = 'update';
            data.annotation_id = globals.editedAnnotationsId;
            editing = true;
        }

        $('.js_feedback').stop().addClass('hidden');
        $('.annotate_button').prop('disabled', true);
        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/' + action + '/', {
            type: 'POST',
            headers: gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (data, textStatus, jqXHR) {
                if (jqXHR.status === 200) {
                    if (editing) {
                        displayFeedback($('#feedback_annotation_updated'));
                    } else {
                        displayFeedback($('#feedback_annotation_exists'));
                    }
                } else if (jqXHR.status === 201) {
                    displayFeedback($('#feedback_annotation_created'));
                }

                if (reload_list === true) {
                    loadImageList();
                }

                // update current annotations
                const index = globals.allAnnotations.findIndex((elem) => elem.id === data.annotations.id);
                if (index === -1) {
                    globals.allAnnotations.push(data.annotations)
                } else {
                    globals.allAnnotations[index] = data.annotations;
                }

                gAnnotationCache[gImageId] = globals.allAnnotations;

                tool.drawAnnotation(data.annotations, update_view = true);
                $('.annotation').removeClass('alert-info');
                globals.editActiveContainer.addClass('hidden');

                if (typeof(successCallback) === "function") {
                    successCallback();
                }
                $('.annotate_button').prop('disabled', false);

                globals.editedAnnotationsId = data.annotations.id;
                editAnnotation(undefined, data.annotations);
            },
            error: function () {
                $('.annotate_button').prop('disabled', false);
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }

    function loadAnnotationTypeList(imageSetId) {
        let params = {
            imageset_id: imageSetId
        };

        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/loadannotationtypes/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data) {
                displayAnnotationTypeOptions(data.annotation_types);
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'))
            }
        })
    }

    function displayAnnotationTypeOptions(annotationTypeList) {
        // TODO: empty the options?
        let annotationTypeFilterSelect = $('#filter_annotation_type');
        let annotationTypeToolSelect = $('#annotation_type_id');

        $.each(annotationTypeList, function (key, annotationType) {


            annotationTypeToolSelect.append($('<option/>', {
                name: annotationType.name,
                value: annotationType.id,
                style: "background-color: " + annotationType.color_code,
                html: annotationType.name + ' (' + (key) + ')',
                id: 'annotation_type_' + (key),
                'data-vector-type': annotationType.vector_type,
                'data-node-count': annotationType.node_count,
                'data-blurred': annotationType.enable_blurred,
                'data-concealed': annotationType.enable_concealed,
            }));

            annotationTypeFilterSelect.append($('<option/>', {
                name: annotationType.name,
                value: annotationType.id,
                html: annotationType.name
            }));
        });
    }

    /**
     * Delete an annotation.
     *
     * @param event
     * @param annotationId
     */
    function deleteAnnotation(event, annotationId) {
        if (globals.editedAnnotationsId === annotationId) {
            // stop editing
            $('#not_in_image').prop('checked', false).change();
        }

        if (event !== undefined) {
            // triggered using an event handler
            event.preventDefault();

            // TODO: Do not use a primitive js confirm
            if (!confirm('Do you really want to delete the annotation?')) {
                return;
            }
        }
        $('.js_feedback').stop().addClass('hidden');
        var params = {
            annotation_id: annotationId
        };
        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/delete/?' + $.param(params), {
            type: 'DELETE',
            headers: gHeaders,
            dataType: 'json',
            success: function (data) {
                tool.removeAnnotation(data.annotations.id);
                globals.allAnnotations = globals.allAnnotations.filter(function(value, index, arr){
                    return value.id !== data.annotations.id;
                });
                gAnnotationCache[gImageId] = globals.allAnnotations;
                displayFeedback($('#feedback_annotation_deleted'));
                globals.editedAnnotationsId = undefined;

                tool.resetSelection(true);
            },
            error: function () {
                $('.annotate_button').prop('disabled', false);
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }

    /**
     * Highlight one annotation in a different color
     * @param annotationTypeId
     * @param annotationId
     */

    function handleMouseClick(e) {
        // no element
        if (e.target instanceof HTMLCanvasElement
            && globals.editedAnnotationsId !== undefined
            && !viewer.selectionInstance.isSelecting) {
            globals.editedAnnotationsId = undefined;

            tool.resetSelection(true);
        } else if ($(e.toElement).data().hasOwnProperty('annotationid')) {
            if (viewer.selectionInstance.isSelecting){
                let id = $(e.toElement).data().annotationid;
                globals.editedAnnotationsId = id;

                annotation = globals.allAnnotations.filter(function (d) {
                    return d.id === id;
                })[0];
                editAnnotation(e, annotation);

                viewer.selectionInstance.initRect(annotation)
            }
        }
    }

    /**
     * Display an image from the image cache or the server.
     *
     * @param imageId
     */
    function displayImage(imageId) {
        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            console.log(
                'skiping request to load image ' + imageId +
                ' as it is not in current image list.');
            return;
        }

        gImageId = imageId;
        preloadAnnotations();

        viewer.open({tileSource: window.location.origin + "/images/image/" + imageId});
    }

    /**
     * Display the images of an image list.
     *
     * @param imageList
     */
    function displayImageList(imageList) {
        var oldImageList = $('#image_list');
        var result = $('<div>');
        var imageContained = false;

        oldImageList.html('');

        for (var i = 0; i < imageList.length; i++) {
            var image = imageList[i];

            var link = $('<a>');
            link.attr('id', 'annotate_image_link_' + image.id);
            link.attr('href', ANNOTATE_URL.replace('%s', image.id));
            link.addClass('annotate_image_link');
            if (image.id === gImageId) {
                link.addClass('active');
                imageContained = true;
            }
            link.text(image.name);
            link.data('imageid', image.id);
            link.click(function (event) {
                event.preventDefault();
                loadAnnotateView($(this).data('imageid'));
            });

            result.append(link);
        }

        oldImageList.attr('id', '');
        result.attr('id', 'image_list');
        oldImageList.replaceWith(result);

        gImageList = getImageList();

        // load first image if current image is not within image set
        if (!imageContained) {
            loadAnnotateView(imageList[0].id);
        }

        scrollImageList();
    }

    /**
     * Display a feedback element for a few seconds.
     *
     * @param elem
     */
    function displayFeedback(elem) {
        if (gHideFeedbackTimeout !== undefined) {
            clearTimeout(gHideFeedbackTimeout);
        }

        elem.removeClass('hidden');

        gHideFeedbackTimeout = setTimeout(function () {
            $('.js_feedback').addClass('hidden');
        }, FEEDBACK_DISPLAY_TIME);
    }

    /**
     * Edit an annotation.
     *
     * @param event
     * @param annotationElem the element which stores the edit button of the annotation
     * @param annotationId
     */
    function editAnnotation(event, annotation) {
        //annotationElem = $(annotationElem);
        let annotationTypeId = annotation.annotation_type.id;
        $('#annotation_type_id').val(annotationTypeId);
        handleAnnotationTypeChange();
        globals.editedAnnotationsId = annotation.id;
        globals.editActiveContainer.removeClass('hidden');

        if (event !== undefined) {
            // triggered using an event handler
            event.preventDefault();
        }
        $('.js_feedback').stop().addClass('hidden');
        var params = {
            annotation_id: annotation.id
        };

        var annotationData = annotation.vector;
        if (annotationData === undefined) {
            annotationData = annotationElem.data('escapedvector');
        }

        // highlight currently edited annotation
        $('.annotation').removeClass('alert-info');

        var notInImage = $('#not_in_image');
        if (annotationData === null) {
            // not in image
            notInImage.prop('checked', true).change();
            return;
        }

        $('#annotation_type_id').val(annotationTypeId);

        notInImage.prop('checked', false).change();


        tool.reloadSelection(annotation.id, annotationData);
        $('#concealed').prop('checked', annotation.concealed).change();
        $('#blurred').prop('checked', annotation.blurred).change();

    }

    /**
     * Get the image list from all .annotate_image_link within #image_list.
     */
    function getImageList() {
        var imageList = [];
        $('#image_list').find('.annotate_image_link').each(function (key, elem) {
            var imageId = parseInt($(elem).data('imageid'));
            if (imageList.indexOf(imageId) === -1) {
                imageList.push(imageId);
            }
        });

        return imageList;
    }

    /**
     * Validate a vector.
     *
     * @param vector
     * @param vector_type
     * @param node_count
     */
    function validate_vector(vector, vector_type, node_count) {
        if (vector === null) {
            // not in image
            return true;
        }
        let len = Object.keys(vector).length;
        switch (vector_type) {
            case 1: // Ball (Boundingbox)
                return vector.x2 - vector.x1 >= 1 && vector.y2 - vector.y1 >= 1 && len === 4;
            case 2: // Point
                return vector.hasOwnProperty('x1') && vector.hasOwnProperty('y1') && len === 2 && !(vector.x1 === 0 && vector.y1 === 0);
            case 3: // Line
                return vector.x1 !== vector.x2 || vector.y1 !== vector.y2 && len === 4;
            case 4: // Multiline
                    // a multiline should have at least two points
                if (len < 4) {
                    return false;
                }
                for (let i = 1; i < len / 2 + 1; i++) {
                    for (let j = 1; j < len / 2 + 1; j++) {
                        if (i !== j && vector['x' + i] === vector['x' + j] && vector['y' + i] === vector['y' + j]) {
                            return false;
                        }
                    }
                }
                return true;
            case 5: // Polygon
                if (len < 6) {
                    // A polygon should have at least three points
                    return false;
                }
                if (node_count !== 0 && node_count !== (len / 2)) {
                    return false;
                }
                for (let i = 1; i <= len / 2; i++) {
                    for (let j = 1; j <= len / 2; j++) {
                        if (i !== j && vector["x" + i] === vector["x" + j] && vector["y" + i] === vector["y" + j]) {
                            return false;
                        }
                    }
                }
                return true;
        }
        return false;
    }

    /**
     * Handle toggle of the not in image checkbox.
     *
     * @param event
     */
    function handleNotInImageToggle(event) {
        let coordinate_table = $('#coordinate_table');

        if ($('#not_in_image').is(':checked')) {
            coordinate_table.hide();
        } else {
            coordinate_table.show();
        }
    }

    /**
     * Handle toggle of the draw annotations checkbox.
     *
     * @param event
     */
    function handleShowAnnotationsToggle(event) {
        globals.drawAnnotations = $('#draw_annotations').is(':checked');
        if (globals.drawAnnotations) {
            tool.drawExistingAnnotations(globals.allAnnotations);
        } else {
            tool.clear();
        }
    }

    /**
     * Handle a selection using the mouse.
     *
     * @param event
     */
    function handleSelection(event) {
    }

    /**
     * Load the annotation view for another image.
     *
     * @param imageId
     * @param fromHistory
     */
    function loadAnnotateView(imageId, fromHistory) {
        globals.editedAnnotationsId = undefined;

        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            console.log(
                'skiping request to load image ' + imageId +
                ' as it is not in current image list.');
            return;
        }

        var noAnnotations = $('#no_annotations');
        var notInImage = $('#not_in_image');
        var existingAnnotations = $('#existing_annotations');
        var loading = $('#annotations_loading');
        existingAnnotations.addClass('hidden');
        noAnnotations.addClass('hidden');
        notInImage.prop('checked', false).change();
        loading.removeClass('hidden');
        $('#annotation_type_id').val(gAnnotationType);

        displayImage(imageId);

        $('#coordinate_table').hide();
        $('#annotation_buttons').hide();

        if (!$('#keep_selection').prop('checked')) {
            $('#concealed').prop('checked', false);
            $('#blurred').prop('checked', false);
        }
        scrollImageList();

        $('.annotate_image_link').removeClass('active');
        var link = $('#annotate_image_link_' + imageId);
        link.addClass('active');
        $('#active_image_name').text(link.text().trim());
        let next_image_id = gImageList[gImageList.indexOf(imageId) + 1];
        if (gImageList.length !== 1 && next_image_id === undefined) {
            next_image_id = gImageList[0];
        }
        $('#next-image-id').attr('value', next_image_id || '');

        if (fromHistory !== true) {
            history.pushState({
                imageId: imageId
            }, document.title, '/annotations/' + imageId + '/');
        }

        let handleNewAnnotations = function () {
            // image is in cache.
            globals.allAnnotations = gAnnotationCache[imageId];
            loading.addClass('hidden');
            tool.drawExistingAnnotations(globals.allAnnotations);
        };

        // load existing annotations for this image
        if (gAnnotationCache[imageId] === undefined) {
            // image is not available in cache. Load it.
            loadAnnotationsToCache(imageId);
            $(document).one("ajaxStop", handleNewAnnotations);
        } else if ($.isEmptyObject(gAnnotationCache[imageId])) {
            // we are already loading the annotation, wait for ajax
            $(document).one("ajaxStop", handleNewAnnotations);
        } else {
            handleNewAnnotations();
        }

        loadImageList();
    }

    /**
     * Load the image list from tye server applying a new filter.
     */
    function loadImageList() {
        let filterElem = $('#filter_annotation_type');
        let filter = filterElem.val();
        let params = {
            image_set_id: gImageSetId,
            filter_annotation_type_id: filter
        };

        // select the corresponding annotation type for the label tool
        if (filter !== '' && !isNaN(filter)) {
            params.filter_annotation_type_id = filter;
            $('#annotation_type_id').val(filter);
            handleAnnotationTypeChange();
        }

        $.ajax(API_IMAGES_BASE_URL + 'imageset/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                if (data.image_set.images.length === 0) {
                    // redirect to image set view.
                    displayFeedback($('#feedback_image_set_empty'));
                    filterElem.val('').change();
                    return;
                }
                displayImageList(data.image_set.images);
            },
            error: function () {
                $('.annotate_button').prop('disabled', false);
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }

    /**
     * Load the annotations of an image to the cache if they are not in it already.
     *
     * @param imageId
     */
    function loadAnnotationsToCache(imageId) {
        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            console.log(
                'skiping request to load annotations of image ' + imageId +
                ' as it is not in current image list.');
            return;
        }

        if (gAnnotationCache[imageId] !== undefined) {
            // already cached
            return;
        }
        // prevent multiple ajax requests for the same image
        gAnnotationCache[imageId] = {};

        var params = {
            image_id: imageId
        };
        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data) {
                // save the current annotations to the cache
                gAnnotationCache[imageId] = data.annotations;
                console.log("Saving annotations for", imageId);
            },
            error: function () {
                console.log("Unable to load annotations for image" + imageId);
            }
        });
    }

    /**
     * Load the previous or the next image
     *
     * @param offset integer to add to the current image index
     */
    function loadAdjacentImage(offset) {
        var imageIndex = gImageList.indexOf(gImageId);
        if (imageIndex < 0) {
            console.log('current image is not referenced from page!');
            return;
        }

        imageIndex += offset;
        while (imageIndex < 0) {
            imageIndex += imageIndex.length;
        }
        while (imageIndex > imageIndex.length) {
            imageIndex -= imageIndex.length;
        }

        loadAnnotateView(gImageList[imageIndex]);
    }

    /**
     * Delete all images from cache except for those in Array keep
     *
     * @param keep Array of the image ids which should be kept in the cache.
     */
    function pruneAnnotationCache(keep) {
        for (var imageId in gAnnotationCache) {
            imageId = parseInt(imageId);
            if (gAnnotationCache[imageId] !== undefined && keep.indexOf(imageId) === -1) {
                delete gAnnotationCache[imageId];
            }
        }
    }

    /**
     * Preload next and previous annotations to cache.
     */
    function preloadAnnotations() {
        var keepAnnotations = [];
        for (var imageId = gImageId - PRELOAD_BACKWARD;
             imageId <= gImageId + PRELOAD_FORWARD;
             imageId++) {
            keepAnnotations.push(imageId);
            loadAnnotationsToCache(imageId);
        }
        pruneAnnotationCache(keepAnnotations);
    }

    /**
     * Scroll image list to make current image visible.
     */
    function scrollImageList() {
        var imageLink = $('#annotate_image_link_' + gImageId);
        var list = $('#image_list');

        var offset = list.offset().top;
        var linkTop = imageLink.offset().top;

        // link should be (roughly) in the middle of the element
        offset += parseInt(list.height() / 2);

        list.scrollTop(list.scrollTop() + linkTop - offset);
    }

    /**
     * Handle the selection change of the annotation type.
     */

    function handleAnnotationTypeChange() {
        AnnotationType = parseInt($('#annotation_type_id').val());
        setTool();
    }

    function handleMouseDown(event) {

        if (!$('#draw_annotations').is(':checked'))
            return;

        if (parseInt($('#annotation_type_id').val()) === -1) {
            displayFeedback($('#feedback_annotation_type_missing'));
            return;
        }

        tool.handleMouseDown(event);
    }

    function handleMouseUp(event) {
        return;
        if (!$('#draw_annotations').is(':checked'))
            return;

        tool.handleMouseUp(event);
    }

    // handle DEL key press
    function handleDelete(event) {
        if (globals.editedAnnotationsId === undefined)
            return;

        deleteAnnotation(event, globals.editedAnnotationsId);
    }

    function selectAnnotationType(annotationTypeNumber) {
        if (typeof annotationTypeNumber == "undefined")
            return

        var annotationTypeId = '#annotation_type_' + annotationTypeNumber;
        var option = $(annotationTypeId);
        if (option.length) {
            $('#annotation_type_id').val(option.val());
        }
        handleAnnotationTypeChange();
    }


    $(function () {
        let get_params = decodeURIComponent(window.location.search.substring(1)).split('&');
        let editAnnotationId = undefined;
        for (let i = 0; i < get_params.length; i++) {
            let parameter = get_params[i].split('=');
            if (parameter[0] === "edit") {
                editAnnotationId = parameter[1];
                break;
            }
        }
        globals.editActiveContainer = $('#edit_active');
        globals.drawAnnotations = $('#draw_annotations').is(':checked');

        // get current environment
        gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();
        gImageId = parseInt($('#image_id').html());
        gImageSetId = parseInt($('#image_set_id').html());
        gHeaders = {
            "Content-Type": 'application/json',
            "X-CSRFTOKEN": gCsrfToken
        };
        gImageList = getImageList();
        loadAnnotationTypeList(gImageSetId);
        preloadAnnotations();
        scrollImageList();

        // W3C standards do not define the load event on images, we therefore need to use
        // it from window (this should wait for all external sources including images)
        $(window).on('load', function () {
            initTool();
        }());

        $('.annotation_value').on('input', function () {
            tool.reloadSelection();
        });
        $('#not_in_image').on('change', handleNotInImageToggle);
        handleNotInImageToggle();
        $('select#filter_annotation_type').on('change', loadImageList);
        $('#filter_update_btn').on('click', loadImageList);
        $('select').on('change', function () {
            document.activeElement.blur();
        });
        $('#draw_annotations').on('change', handleShowAnnotationsToggle);
        $('select#annotation_type_id').on('change', handleAnnotationTypeChange);

        // register click events
        $(window).click(function (e) {
            handleMouseClick(e);
        });
        $('#cancel_edit_button').click(function () {
            tool.resetSelection(true);
        });
        $('#delete_annotation_button').click(function () {
            deleteAnnotation(undefined, globals.editedAnnotationsId);
        });
        $('#verify_annotation_button').click(function () {
            let data_val = {
                annotation_id: globals.editedAnnotationsId,
                state: 'accept',
            };

            // update current annotations
            $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
                type: 'POST',
                headers: gHeaders,
                dataType: 'json',
                data: JSON.stringify(data_val),
                success: function (data) {
                    displayFeedback($('#feedback_verify_successful'));
                    loadImageList();
                },
                error: function () {
                    displayFeedback($('#feedback_connection_error'));
                }
            })
        });
        $('#save_button').click(function () {
            viewer.selectionInstance.confirm();
        });
        $('#reset_button').click(function () {
            viewer.selectionInstance.cancel();
            tool.resetSelection(true);
        });
        $('#last_button').click(function (event) {
            event.preventDefault();
            createAnnotation(undefined, function () {
                loadAdjacentImage(-1);
            }, true, true);
        });
        $('#back_button').click(function (event) {
            event.preventDefault();
            loadAdjacentImage(-1);
        });
        $('#skip_button').click(function (event) {
            event.preventDefault();
            loadAdjacentImage(1);
        });
        $('#next_button').click(function (event) {
            event.preventDefault();

            if (globals.allAnnotations.length == 0) {

                var annotationTypeId = parseInt($('#annotation_type_id').val());
                var action = 'create';
                var data = {
                    annotation_type_id: annotationTypeId,
                    image_id: gImageId,
                    vector: null,
                    concealed: false,
                    blurred: false
                };

                $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/' + action + '/', {
                    type: 'POST',
                    headers: gHeaders,
                    dataType: 'json',
                    data: JSON.stringify(data),
                    success: function (data) {
                        displayFeedback($('#feedback_verify_successful'));

                        let data_val = {
                            annotation_id: data.annotations["0"].id,
                            state: 'accept',
                        };

                        // update current annotations
                        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
                            type: 'POST',
                            headers: gHeaders,
                            dataType: 'json',
                            data: JSON.stringify(data_val),
                            success: function (data) {
                                displayFeedback($('#feedback_verify_successful'));
                                loadImageList();
                            },
                            error: function () {
                                displayFeedback($('#feedback_connection_error'));
                            }
                        })
                    },
                    error: function () {
                        displayFeedback($('#feedback_connection_error'));
                    }
                })
            }

            for (i = 0; i < globals.allAnnotations.length; i++) {
                let anno = globals.allAnnotations[i];

                let data = {
                    annotation_id: anno.id,
                    state: 'accept',
                };

                $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
                    type: 'POST',
                    headers: gHeaders,
                    dataType: 'json',
                    data: JSON.stringify(data),
                    success: function (data) {
                        displayFeedback($('#feedback_verify_successful'));
                    },
                    error: function () {
                        displayFeedback($('#feedback_connection_error'));
                    }
                })
            }

            loadImageList();
            loadAdjacentImage(1);
        });
        $('.js_feedback').mouseover(function () {
            $(this).addClass('hidden');
        });
        $('.annotate_image_link').click(function (event) {
            event.preventDefault();
            loadAnnotateView($(this).data('imageid'));
        });

        // annotation buttons
        $('.annotation_edit_button').each(function (key, elem) {
            return;
            elem = $(elem);
            elem.click(function (event) {
                editAnnotation(event, this, parseInt(elem.data('annotationid')));
            });
        });
        $('.annotation_delete_button').each(function (key, elem) {
            elem = $(elem);
            elem.click(function (event) {
                deleteAnnotation(event, parseInt(elem.data('annotationid')));
            });
        });

        $(document).on('mousemove touchmove', handleSelection);
        window.onpopstate = function (event) {
            if (event.state !== undefined && event.state !== null && event.state.imageId !== undefined) {
                loadAnnotateView(event.state.imageId, true);
            }
        };

        // attach listeners for mouse events
        $(document).on('mousedown.annotation_edit', handleMouseDown);
        // we have to bind the mouse up event globally to also catch mouseup on small selections
        $(document).on('mouseup.annotation_edit', handleMouseUp);

        $(document).keydown(function (event) {
            switch (event.keyCode) {
                case 16: // Shift
                    gShiftDown = true;
                    break;
                case 27: // Escape
                    tool.handleEscape();
                    break;
                case 73: //i
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 75: //k
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 76: //l
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 74: //j
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 48: //0
                    selectAnnotationType(0);
                    break;
                case 49: //1
                    selectAnnotationType(1);
                    break;
                case 50: //2
                    selectAnnotationType(2);
                    break;
                case 51: //3
                    selectAnnotationType(3);
                    break;
                case 52: //4
                    selectAnnotationType(4);
                    break;
                case 53: //5
                    selectAnnotationType(5);
                    break;
                case 54: //6
                    selectAnnotationType(6);
                    break;
                case 55: //7
                    selectAnnotationType(7);
                    break;
                case 56: //8
                    selectAnnotationType(8);
                    break;
                case 57: //9
                    selectAnnotationType(9);
                    break;
                case 99: //c
                    break;
            }
        });
        $(document).keyup(function (event) {
            switch (event.keyCode) {
                case 16: // Shift
                    gShiftDown = false;
                    break;
                case 70: //f
                    $('#next_button').click();
                    break;
                case 68: //d
                    $('#skip_button').click();
                    break;
                case 83: //s
                    $('#back_button').click();
                    break;
                case 65: //a
                    $('#last_button').click();
                    break;
                case 71: //g
                    $('#not_in_image').click();
                    break;
                case 82: //r
                    $('#reset_button').click();
                    break;
                case 86: //'v'
                    $('#save_button').click();
                    break;
                case 46: //'DEL'
                    handleDelete(event);
                    break;
                case 66: //b
                    $('#blurred').click();
                    break;
                case 67: //c
                    $('#concealed').click();
                    break;
            }
        });
        $(document).one("ajaxStop", function () {
            selectAnnotationType($('#main_annotation_type_id').html());
            if (editAnnotationId) {
                $('#annotation_edit_button_' + editAnnotationId).click();
            }
        });
    });
})();
