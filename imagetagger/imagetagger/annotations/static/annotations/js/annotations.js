globals = {
    editedAnnotationsId: undefined,
    editActiveContainer: {},
    drawAnnotations: true,
    allAnnotations: undefined,
    isSelecting: false
};


(function () {
    const API_ANNOTATIONS_BASE_URL = '/annotations/api/';
    const API_IMAGES_BASE_URL = '/images/api/';
    const FEEDBACK_DISPLAY_TIME = 3000;
    const ANNOTATE_URL = '/annotations/%s/';
    const IMAGE_SET_URL = '/images/imageset/%s/';
    const PRELOAD_BACKWARD = 1;
    const PRELOAD_FORWARD = 1;
    const STATIC_ROOT = '/static/';

    // TODO: Find a solution for url resolvings

    var gCsrfToken;
    var gHeaders;
    var gHideFeedbackTimeout;
    var gImageId;
    var gImageSetId;
    var gImageList;
    var gFilterType = "All";
    var gAnnotationType = -1;
    var gAnnotationTypes = {};
    var gAnnotationKeyToIdLookUp = {};
    let gAnnotationCache = {};
    let gImageInformation = {};
    var gZoomSlider;
    var gLastUpdateTimePoint = Math.floor(Date.now() / 1000);
    var gRefreshAnnotationsFromServer;
    var gUpDateFromServerInterval = 3000; // 300s
    var gShiftDown;

    var tool;
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
        zoomPerScroll: 1.5,
        timeout: 120000,
    });
    // viewer.gestureSettingsMouse.clickToZoom = false;


    viewer.selection({
        allowRotation: false,
        restrictToImage: true,
        showSelectionControl: false
    });

    viewer.scalebar({
        xOffset: 10,
        yOffset: 10,
        barThickness: 3,
        color: '#555555',
        fontColor: '#333333',
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        pixelsPerMeter: 0
    });

    //var imagingHelper = viewer.activateImagingHelper();
    viewer.activateImagingHelper({onImageViewChanged: onImageViewChanged});


    viewer.addHandler("open", function () {
        // To improve load times, ignore the lowest-resolution Deep Zoom
        // levels.  This is a hack: we can't configure the minLevel via
        // OpenSeadragon configuration options when the viewer is created
        // from DZI XML.
        //viewer.source.minLevel = 8;
        console.log("image  open");

        $.ajax(API_IMAGES_BASE_URL + 'image/opened/' + gImageId, {
                type: 'GET',
                headers: gHeaders});

        handleResize();

        viewer.scalebar({
            pixelsPerMeter: gImageInformation[gImageId]['mpp'] > 0.0001 ? (1e6 / gImageInformation[gImageId]['mpp']) : 0,
        });

        var objectivePower = gImageInformation[gImageId]['objectivePower'];
        if (objectivePower > 1) {

            const default_ticks = [0, 1, 2, 5, 10, 20, 40, 80, 160];
            const default_names = ["0x", "1x", "2x", "5x", "10x", "20x", "40x", "80x", "160x" ];

            var ticks_to_use = [];
            var labels_to_use = [];

            for (i = 0; i < default_ticks.length; i++) {
                if (default_ticks[i] <= objectivePower){
                    ticks_to_use.push(default_ticks[i]);
                    labels_to_use.push(default_names[i]);
                } else {
                    ticks_to_use.push(default_ticks[i]);
                    labels_to_use.push(default_names[i]);
                    break;
                }
            }

            if (gZoomSlider === undefined) {
                gZoomSlider = new Slider("#zoomSlider", {
                    ticks: ticks_to_use,
                    scale: 'logarithmic',
                    ticks_labels: labels_to_use,
                    tooltip: 'always'
                });
                gZoomSlider.on('change', onSliderChanged);
            } else {
                gZoomSlider.setAttribute('ticks', ticks_to_use);
                gZoomSlider.setAttribute('ticks_labels', labels_to_use);
            }
        }


        // Check if navigator overlay exists or is supported
        $.ajax(API_IMAGES_BASE_URL + 'image/navigator_overlay_status/', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            data: {image_id: gImageId},
            success: function (data, textStatus, jqXHR) {
                // Navigator overlay exists and can be set
                if (jqXHR.status === 200) {

                    var navigator_overlay = {
                        Image: {
                            xmlns: "http://schemas.microsoft.com/deepzoom/2008",
                            Url: window.location.origin + "/images/image/" + gImageId + "_navigator_overlay/",
                            Format: "jpeg",
                            Overlap: "2",
                            TileSize: "256",
                            Size: {
                                Width: gImageInformation[gImageId]['width'],
                                Height: gImageInformation[gImageId]['height'],
                            }
                        }
                    };

                    var tiledImage = viewer.world.getItemAt(0);
                    viewer.navigator.addTiledImage({
                        tileSource: navigator_overlay,
                        originalTiledImage: tiledImage
                    });
                }
            },
            error: function () {

            }
        });
    });


    function onImageViewChanged(event) {

        if (gZoomSlider !== undefined &&
            gZoomSlider.getValue().toFixed(3)
            !== (event.zoomFactor * gImageInformation[gImageId]['objectivePower']).toFixed(3)) {

            gZoomSlider.setValue(gImageInformation[gImageId]['objectivePower'] * event.zoomFactor);
        }
    }

    function onSliderChanged(event) {

        if (viewer.imagingHelper.getZoomFactor().toFixed(3) !==
            (event.newValue / gImageInformation[gImageId]['objectivePower']).toFixed(3))

            viewer.imagingHelper.setZoomFactor(event.newValue / gImageInformation[gImageId]['objectivePower'], true);
    }

    viewer.addHandler('tile-loaded', function (e) {
        //if (!e.fullScreen)
        //handleResize();

	preloadAnnotations(gImageId, gImageList);
    });

    viewer.addHandler('full-screen', function (e) {
        //if (!e.fullScreen)
        //handleResize();
    });

    /*
       User navigation interaction on the image finished
     */
    viewer.addHandler('animation-finish', function (e) {
        updatePlugins(gImageId);

    });


    viewer.addHandler("selection_onScroll", function (event) {
        tool.resizeItem(event);
    });

    /*
       confirm selection
     */
    viewer.addHandler("selection_onDragEnd", function (event) {

    });

    viewer.addHandler('selection_onDrag', function (event) {

        if (globals.editedAnnotationsId !== undefined) {

            tool.handleMouseDrag(event);
        }
    });

    viewer.addHandler('selection_toggle', function (event) {

        if (event.enabled === false && globals.editedAnnotationsId !== undefined) {
            finishAnnotation(globals.editedAnnotationsId);
        }

    });

    function finishAnnotation(id) {

        if (id !== undefined) {

            var annotation = globals.allAnnotations.filter(function (d) {
                return d.id === id;
            })[0];

            saveAnnotationAtServer(annotation);
            tool.resetSelection();
        }
    }

    viewer.addHandler('selection_onPress', function (event) {

        // Convert pixel to viewport coordinates
        var viewportPoint = viewer.viewport.pointFromPixel(event.position);

        // Convert from viewport coordinates to image coordinates.
        var imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

        // check if the point is inside the image
        if (tool.isPointInImage(imagePoint)) {

            var id = tool.hitTest(imagePoint);

            // check if annotation was hit
            if (id !== undefined){
                // if the user jumps from one annotation to the next
                // cancel and save fist annotation
                if (globals.editedAnnotationsId !== undefined &&
                    id !== globals.editedAnnotationsId) {

                    finishAnnotation(globals.editedAnnotationsId);
                }
                tool.handleMousePress(event);

                globals.editedAnnotationsId = id;

                var annotation = globals.allAnnotations.filter(function (d) {
                    return d.id === id;
                })[0];
                enableAnnotationEditing(annotation);


            } else {

                let selected_annotation_type = gAnnotationType;

                if (selected_annotation_type === undefined) {
                    $("#annotation_type_id").notify("You have to choose a type for the annotation.",
                            {position: "right", className: "error"});

                    return;
                }

                if (globals.editedAnnotationsId === undefined) {

                    // create new anno
                    var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                    globals.allAnnotations.push(newAnno);
                    enableAnnotationEditing(newAnno);

                } else if (globals.editedAnnotationsId !== undefined &&
                    id === undefined) {

                    finishAnnotation(globals.editedAnnotationsId);

                    // create new anno
                    var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                    globals.allAnnotations.push(newAnno);
                    enableAnnotationEditing(newAnno);
                }
            }
        }
    });

    /*
       cancel selection
     */
    viewer.addHandler("selection_cancel", function (data) {
        CancelEdit(globals.editedAnnotationsId);
    });

    viewer.guides({
        allowRotation: false,        // Make it possible to rotate the guidelines (by double clicking them)
        horizontalGuideButton: null, // Element for horizontal guideline button
        verticalGuideButton: null,   // Element for vertical guideline button
        prefixUrl: '../../static/images/',
        removeOnClose: true,        // Remove guidelines when viewer closes
        useSessionStorage: false,    // Save guidelines in sessionStorage
        navImages: {
            guideHorizontal: {
                REST: 'guidehorizontal_rest.png',
                GROUP: 'guidehorizontal_grouphover.png',
                HOVER: 'guidehorizontal_hover.png',
                DOWN: 'guidehorizontal_pressed.png'
            },
            guideVertical: {
                REST: 'guidevertical_rest.png',
                GROUP: 'guidevertical_grouphover.png',
                HOVER: 'guidevertical_hover.png',
                DOWN: 'guidevertical_pressed.png'
            }
        }
    });


    function shorten(string, length) {
        let threshold = length || 30;
        if (string.length < threshold) {
            return string;
        } else {
            return string.substr(0, threshold / 2 - 1) + '...' + string.substr(-threshold / 2 + 2, threshold / 2 - 2);
        }
    }

    function updateSearch() {

        var searchText = $('#searchInputAnnotation').val().trim().toLowerCase();

        var table = document.getElementById('annotationSearchResults');

        // remove all elements from table expect first
        while (table.childNodes.length > 3) {
            table.removeChild(table.lastChild);
        }


        if(searchText) {

            var searchFields = ['@id', '@label', '@first editor', '@last editor', '@remark']

            if (searchFields.some(searchField => searchText.includes(searchField))) {

                var all_annotations = globals.allAnnotations;

                var search_requests = searchText.split(';');

                search_requests.forEach(function(item, index) {
                    if (item.includes(':')) {

                        var field = item.split(':')[0];
                        var value = item.split(':')[1];

                        switch (field) {
                            case "@id":
                                if (!isNaN(parseInt(value)))
                                    value = parseInt(value);

                                all_annotations = all_annotations.filter(function(item) {
                                   return item.id === value;
                                });
                                break;

                            case "@label":
                                all_annotations = all_annotations.filter(function(item) {
                                   return item.annotation_type.name.toLowerCase() === value;
                                });
                                break;

                            case "@first editor":
                                all_annotations = all_annotations.filter(function(item) {
                                   return item.first_editor.toLowerCase() === value;
                                });
                                break;

                            case "@last editor":
                                all_annotations = all_annotations.filter(function(item) {
                                   return item.last_editor.toLowerCase() === value;
                                });
                                break;

                            case "@verified":
                                all_annotations = all_annotations.filter(function(item) {
                                   item.is_verified.toString() === value;
                                });
                                break;

                            case "@verified":
                                all_annotations = all_annotations.filter(function(item) {
                                   return item.remark.toLowerCase().includes(value);
                                });
                                break;

                            default:
                                break;
                        }
                    }
                });


                all_annotations.slice(0, 10).forEach(function (item) {

                    var row = document.createElement("tr");

                    // ID
                    var column = document.createElement("th");
                    var id_link = document.createElement("a");
                    id_link.textContent = item.id;
                    id_link.onclick = function (event) {
                        var id = event.currentTarget.innerText;
                        tool.showItem(id);
                    };
                    column.appendChild(id_link);
                    row.appendChild(column);

                    // Label
                    column = document.createElement("th");
                    var label = document.createElement("label");
                    label.innerText = item.annotation_type.name;
                    column.appendChild(label);
                    row.appendChild(column);

                    // First Editor
                    var column = document.createElement("th");
                    var name_link = document.createElement("a");
                    name_link.setAttribute('href', `/users/user/${item.first_editor.id}/`);
                    name_link.textContent = item.first_editor.name;
                    column.appendChild(name_link);
                    row.appendChild(column);

                    // First Editor
                    var column = document.createElement("th");
                    name_link = document.createElement("a");
                    name_link.setAttribute('href', `/users/user/${item.last_editor.id}/`);
                    name_link.textContent = item.last_editor.name;
                    column.appendChild(name_link);
                    row.appendChild(column);

                    // verified
                    column = document.createElement("th");
                    var verified = document.createElement("label");
                    verified.innerText = item.is_verified.toString();
                    column.appendChild(verified);
                    row.appendChild(column);

                    // remark
                    column = document.createElement("th");
                    var remark = document.createElement("label");
                    remark.innerText = item.remark;
                    column.appendChild(remark);
                    row.appendChild(column);

                    table.appendChild(row);
                });
            }
        }
    }

    function initTool(imageId) {
        setTool(imageId);
        loadAnnotateView(imageId);
    }

    function setTool(imageId) {

        if (tool && tool.getImageId() === imageId) {
            // Tool does not have to change
            return;
        }

        var strokeWidth = 5;
        if (tool) {
            console.log("Deleted tool for " + tool.getImageId());

            strokeWidth = tool.strokeWidth;
            $.ajax(API_IMAGES_BASE_URL + 'image/closed/' + tool.getImageId(), {type: 'GET', headers: gHeaders});

            tool.clear();
            delete tool;
        }

        if (imageId > 0 && imageId in gImageInformation) {
            tool = new BoundingBoxes(viewer, imageId, gImageInformation[gImageId]);

            if (!OpenSeadragon.isFullScreen())
                tool.strokeWidth = document.getElementById("StrokeWidthSlider").value;

            if (gRefreshAnnotationsFromServer)
                clearInterval(gRefreshAnnotationsFromServer);
            else {
                gRefreshAnnotationsFromServer = setInterval(function () {
                    options = {
                        image_id: imageId,
                        'since': gLastUpdateTimePoint,
                        'include_deleted': true
                    };
                    loadAnnotationsWithConditions(options);
                    gLastUpdateTimePoint = Math.floor(Date.now() / 1000);
                }, gUpDateFromServerInterval);
            }


            //if (globals.allAnnotations) {
            //    tool.drawExistingAnnotations(globals.allAnnotations);
            //}
            console.log("Created tool for " + tool.getImageId());
        }
    }


    /**
     * Create an annotation using the form data from the current page.
     * If an annotation is currently edited, an update is triggered instead.
     *
     * @param event
     * @param successCallback a function to be executed on success
     * @param markForRestore
     */
    function saveAnnotationAtServer(annotation) {

        if (annotation === undefined)
            return;

        var action = 'create';
        var editing = false;
        var description = annotation.annotation;

        if (!OpenSeadragon.isFullScreen())
            description = document.getElementById('annotationRemark').value;


        var data = {
            annotation_type_id: annotation.annotation_type.id,
            image_id: gImageId,
            vector: tool.getAnnotationVector(annotation.id),
            description: description
        };
        if ((typeof annotation.id === 'string') &&
            annotation.id.startsWith('~'))
        {
            data.tempid = annotation.id
        } else if (annotation.id !== undefined) {
            // edit instead of create
            action = 'update';
            data.annotation_id = annotation.id;
            editing = true;
        }

        $('.js_feedback').stop().addClass('hidden');
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

                // update current annotations
                var index = globals.allAnnotations.findIndex((elem) => elem.id === data.annotations.id);
                if (index === -1) {
                    if (data.tempid !== false) {
                        index = globals.allAnnotations.findIndex((elem) => elem.id === data.tempid);
                        tool.updateName(data.tempid, data.annotations.id);
                        globals.allAnnotations[index] = data.annotations;

                        if (globals.editedAnnotationsId == data.tempid)
                            globals.editedAnnotationsId = data.annotations.id;
                    }else {
                        globals.allAnnotations.push(data.annotations)
                    }
                } else {
                    globals.allAnnotations[index] = data.annotations;
                }

                gAnnotationCache[gImageId] = globals.allAnnotations;

                loadStatistics(gImageId);
            },
            error: function () {
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
                data.annotation_types.forEach(x => {
                    gAnnotationTypes[x.id] = x;
                });


                displayAnnotationTypeOptions(data.annotation_types);

                if (data.annotation_types.length > 0) {
                    viewer.selection({
                        allowRotation: false,
                        restrictToImage: true,
                        showSelectionControl: true
                    });

                    var id = parseInt($('#main_annotation_type_id').html().trim());
                    if (id > -1 && id in gAnnotationTypes)
                        gAnnotationType = gAnnotationTypes[$('#main_annotation_type_id').html().trim()];
                    else if (Object.keys(gAnnotationTypes).length > 0)
                        gAnnotationType = gAnnotationTypes[Object.keys(gAnnotationTypes)[0]];


                    data.annotation_types.forEach(x =>
                        $('#DrawCheckBox_'+x.id).change(handleAnnotationVisibilityChanged)
                    );
                }
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'))
            }
        })
    }

    function handleAnnotationVisibilityChanged(event) {
        var annotation_type_id = parseInt(event.target.getAttribute('data-annotation_type-id'));
        tool.updateVisbility(annotation_type_id, event.currentTarget.checked);
    }

    function displayAnnotationTypeOptions(annotationTypeList) {
        // TODO: empty the options?
        let annotationTypeFilterSelect = $('#filter_annotation_type');
        let annotationTypeToolSelect = $('#annotation_type_id');

        $.each(annotationTypeList, function (key, annotationType) {

            gAnnotationKeyToIdLookUp[key] = annotationType.id


            annotationTypeToolSelect.append($('<option/>', {
                name: annotationType.name,
                value: annotationType.id,
                //style: "background-color: " + annotationType.color_code,
                html: annotationType.name + ' (' + (key) + ')',
                id: 'annotation_type_' + (key),
                'data-vector-type': annotationType.vector_type,
                'data-node-count': annotationType.node_count,
                'data-blurred': annotationType.enable_blurred,
                'data-default_width': annotationType.default_width,
                'data-default_height': annotationType.default_height,
                'data-concealed': annotationType.enable_concealed,
                'data-background-color': annotationType.color_code
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

        tool.removeAnnotation(annotationId);
        //  if annotation was not send to server stop now
        if (typeof annotationId === 'string') {
            globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                return value.id !== annotationId;
            });
            gAnnotationCache[gImageId] = globals.allAnnotations;
            displayFeedback($('#feedback_annotation_deleted'));
            globals.editedAnnotationsId = undefined;
            tool.resetSelection();
        } else {
            $('.js_feedback').stop().addClass('hidden');
            var params = {
                annotation_id: annotationId,
                keep_deleted_element: true
            };
            $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/delete/?' + $.param(params), {
                type: 'DELETE',
                headers: gHeaders,
                dataType: 'json',
                success: function (data) {

                    globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                        return value.id !== data.annotations.id;
                    });
                    gAnnotationCache[gImageId] = globals.allAnnotations;
                    displayFeedback($('#feedback_annotation_deleted'));
                    globals.editedAnnotationsId = undefined;

                    tool.resetSelection();
                    loadStatistics(gImageId);
                },
                error: function () {
                    displayFeedback($('#feedback_connection_error'));
                }
            });
        }
    }

    /**
     * Highlight one annotation in a different color
     * @param annotationTypeId
     * @param annotationId
     */

    function handleMouseClick(e) {


    }

    /**
     * Display an image from the image cache or the server.
     *
     * @param imageId
     */
    function displayImage(imageId) {
        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            viewer.close();
        } else {
            gImageId = imageId;

            console.log("displayImage " + imageId);
            viewer.open({tileSource: window.location.origin + "/images/image/" + imageId});

        }

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

        var newImageList = [];

        for (var i = 0; i < imageList.length; i++) {
            var image = imageList[i];

            newImageList.push(image.id);

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

                CancelEdit(globals.editedAnnotationsId);

                image_id = $(this).data('imageid');
                loadAnnotateView(image_id);
            });

            result.append(link);
        }

        oldImageList.attr('id', '');
        result.attr('id', 'image_list');
        oldImageList.replaceWith(result);


        gImageList = newImageList;

        // load first image if current image is not within image set
        if (imageList.length > 0) {
            //loadAnnotateView(imageList[0].id);
            //scrollImageList();
        } else {
            loadAnnotateView(-1);
        }
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
    function enableAnnotationEditing(annotation) {
        //annotationElem = $(annotationElem);
        //let annotationTypeId = annotation.annotation_type.id;
        //$('#annotation_type_id').val(annotationTypeId);
        //handleAnnotationTypeChange();
        //$('#annotation_type_id').val(annotationTypeId);


        globals.editedAnnotationsId = annotation.id;
        globals.editActiveContainer.removeClass('hidden');


        $('.js_feedback').stop().addClass('hidden');

        // highlight currently edited annotation
        $('.annotation').removeClass('alert-info');

        $('#annotation_buttons').show();

        $('#AnnotationInformation').show();

        if (!OpenSeadragon.isFullScreen()) {
            document.getElementById('annotationFirstEditor')
                .setAttribute('href', `/users/user/${annotation.first_editor.id}/`);
            document.getElementById('annotationFirstEditor').textContent = annotation.first_editor.name;

            document.getElementById('annotationLastEditor')
                .setAttribute('href', `/users/user/${annotation.last_editor.id}/`);
            document.getElementById('annotationLastEditor').textContent = annotation.last_editor.name;

            var isoStr = new Date(annotation.last_edit_time).toISOString();
            document.getElementById('annotationLastTime').innerText = isoStr.substring(0, 10);

            document.getElementById('annotationRemark').value = annotation.description;

            if (annotation.is_verified !== undefined)
                document.getElementById('annotationVerified').innerText = annotation.is_verified.toString();

            document.getElementById('annotationUniqueID').textContent = annotation.id;
            document.getElementById('annotationUniqueID').onclick = function (event) {
                var id = event.currentTarget.innerText;
                tool.showItem(id);
            };
        }


        //$('.annotate_button').prop('disabled', true);
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

    function updatePlugins(imageId) {

        var bounds = viewer.viewport.getBounds(true);
        var imageRect = viewer.viewport.viewportToImageRectangle(bounds);

        let data = {
            image_id: imageId,
            options: {
                min_x:  Math.round(imageRect.x),
                min_y:  Math.round(imageRect.y),
                max_x:  Math.round(imageRect.x + imageRect.width),
                max_y:  Math.round(imageRect.y + imageRect.height)
            }

        };

        // update Plugins
        $.ajax(API_IMAGES_BASE_URL + 'image/plugins/', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            data: {'values': JSON.stringify(data)},
            success: function (data) {
                var el = document.getElementById('statistics_tabs');
                if (el) {
                    for (plugin of data.plugins) {
                        var tab_name = plugin.id;

                        if (document.getElementById(tab_name + "_tab") === null){

                            var node = document.createElement("li");
                            node.setAttribute('class', 'nav-item');
                            node.setAttribute('style', "float: none");

                            var tab_name = plugin.id;
                            var link = document.createElement("a");
                            link.setAttribute('class', 'nav-link');
                            link.setAttribute('id', tab_name + "_tab");
                            link.setAttribute('data-toggle', 'tab');
                            link.setAttribute('href', '#' + tab_name);

                            link.textContent = tab_name;

                            node.appendChild(link);
                            el.appendChild(node);
                        }
                    }
                }


                var el_content = document.getElementById('statistics_tabs_content');

                if (el_content) {
                    for (plugin of data.plugins) {
                        var tab_name = plugin.id;

                        var node = document.getElementById(tab_name);
                        if (node === null) {
                            var node = document.createElement("div");
                            node.setAttribute('class', 'tab-pane fade');
                            node.setAttribute('id', tab_name);

                            node.innerHTML = plugin.content;
                            el_content.appendChild(node);
                        } else {
                            node.innerHTML = plugin.content;
                        }
                    }
                }
            },
            error: function () {
            }
        });

    }

    function loadStatistics(imageId) {

        if (OpenSeadragon.isFullScreen())
            return;

        if (imageId > 0) {
            let data = {
                image_id: imageId
            };

            // update statistics
            $.ajax(API_IMAGES_BASE_URL + 'image/statistics/', {
                type: 'GET',
                headers: gHeaders,
                dataType: 'json',
                data: data,
                success: function (data) {

                    Object.keys(gAnnotationTypes).forEach(function (key) {
                        document.getElementById(gAnnotationTypes[key].name + '_' + gAnnotationTypes[key].id).innerHTML = 0;
                    });

                    for (anno_type of data.statistics) {
                        if (anno_type.id in gAnnotationTypes) {
                            document.getElementById(anno_type.name + '_' + anno_type.id).innerHTML =
                                anno_type.in_image_count + ' / ' + anno_type.verified_count;
                        }
                    }
                },
                error: function () {

                }
            });

            updatePlugins(imageId);
        } else {
            Object.keys(gAnnotationTypes).forEach(function (key) {
                document.getElementById(gAnnotationTypes[key].name + '_' + gAnnotationTypes[key].id).innerHTML = 0;
            });
        }
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

        if (imageId > 0) {
            var loading = $('#annotations_loading');


            loading.removeClass('hidden');
            $('#annotation_type_id').val(gAnnotationType.id);

            loadStatistics(imageId);
            displayImage(imageId);

            $('#annotation_buttons').hide();
            $('#AnnotationInformation').hide();


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
                setTool(imageId);
                loading.addClass('hidden');
                tool.drawExistingAnnotations(globals.allAnnotations);
            };

            // load existing annotations for this image
            if (gAnnotationCache[imageId] === undefined) {
                // image is not available in cache. Load it.
                //loadAnnotationsToCache(imageId);
                $(document).one("ajaxStop", handleNewAnnotations);
            } else if ($.isEmptyObject(gAnnotationCache[imageId])) {
                // we are already loading the annotation, wait for ajax
                $(document).one("ajaxStop", handleNewAnnotations);
            } else {
                handleNewAnnotations();
            }
        }
        else {
            // if the image set is empty
            loadStatistics(imageId);
            displayImage(imageId);
            if (tool) {
                tool.clear();
                delete tool;
            }
        }

    }

    /**
     * Load the image list from tye server applying a new filter.
     */
    function loadImageList() {

        let params = {
            image_set_id: gImageSetId,
            filter_annotation_type_id: gFilterType
        };

        $.ajax(API_IMAGES_BASE_URL + 'imageset/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                if (data.image_set.images.length === 0) {
                    // redirect to image set view.
                    if (gFilterType ===  "Unverified") {
                        $("#filter_annotation_type").notify("All images are verified. :)",
                            {position: "top", className: "error", autoHide: false});

                    } else {
                        $("#filter_annotation_type").notify("The image set is empty with that filter applied.",
                            {position: "top", className: "error"});
                        //$('#filter_annotation_type').val('All');
                    }
                }
                displayImageList(data.image_set.images);
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }


    function loadAnnotationsWithConditions(params) {

        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {

                if (jqXHR.status === 200) {
                    var annotations = data.annotations;

                    for (i = 0; i < annotations.length; i++) {
                        var anno = annotations[i];

                        if (anno.deleted) {
                            tool.removeAnnotation(anno.id);
                            globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                                return value.id !== anno.id;
                            });
                            gAnnotationCache[gImageId] = globals.allAnnotations;

                            $.notify(`Annotation ${anno.id} was deleted by ${anno.last_editor.name}`,
                                {position: "bottom center", className: "info"});
                        } else {
                            // update current annotations
                            var index = globals.allAnnotations.findIndex((elem) => elem.id === anno.id
                        )
                            className = "info";
                            if (anno.description.includes('@') &&
                                anno.description.includes(document.getElementById("username").innerText.trim()))
                                className = "warn";

                            if (index === -1) {
                                globals.allAnnotations.push(anno);

                                $.notify(`Annotation ${anno.id} was created by ${anno.last_editor.name}`,
                                    {position: "bottom center", className: className});
                            } else {
                                tool.removeAnnotation(anno.id);
                                globals.allAnnotations[index] = anno;

                                $.notify(`Annotation ${anno.id} was updated by ${anno.last_editor.name}`,
                                    {position: "bottom center", className: className});
                            }
                            tool.drawAnnotation(anno);
                            gAnnotationCache[gImageId] = globals.allAnnotations;
                        }
                    }
                }
            },
            error: function (request, status, error) {
                $.notify(`Server ERR_CONNECTION_REFUSED`, {position: "bottom center", className: "error"});
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
        gAnnotationCache[imageId] = [];

        var x_steps = [];
        var y_steps = [];
        var step = 10000; //pixel
        var num_tiles = 3;
        var stop_x = gImageInformation[gImageId]['width'];
        var stop_y = gImageInformation[gImageId]['height'];

        if (stop_x > step)
            step = Math.ceil(stop_x / num_tiles);

        for (var i = 0; step > 0 ? i < stop_x : i > stop_x; i += step) {
            x_steps.push(i);
        }
        for (var i = 0; step > 0 ? i < stop_y : i > stop_y; i += step) {
            y_steps.push(i);
        }

        console.log("load annotations " + imageId);
        x_steps.forEach(function (x) {

            y_steps.forEach(function (y) {

                var params = {
                    image_id: imageId,
                    'min_x': x,
                    'min_y': y,
                    'max_x': x + step,
                    'max_y': y + step
                };

                $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/load/?' + $.param(params), {
                    type: 'GET',
                    headers: gHeaders,
                    dataType: 'json',
                    success: function (data) {
                        // save the current annotations to the cache
                        gAnnotationCache[imageId] = gAnnotationCache[imageId].concat(data.annotations);

                        if (imageId === tool.getImageId())
                        {
                            globals.allAnnotations = gAnnotationCache[imageId];
                            tool.drawExistingAnnotations(data.annotations);
                        }
                        console.log("Starting to chach annotations for", imageId);
                    },
                    error: function () {
                        console.log("Unable to load annotations for image" + imageId);
                    }
                });
            })
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
     * TODO: Intelligenter machen mit Bildern aus SET!!!
     * Preload next and previous annotations to cache.
     */
    function preloadAnnotations(imageId, imageIds) {
        var keepAnnotations = [];

        var currentIndex = imageIds.indexOf(imageId);
        var startIndex = Math.max(currentIndex - PRELOAD_BACKWARD, 0);
        var endIndex = Math.min(currentIndex + PRELOAD_FORWARD, imageIds.length);
        for (var i = startIndex; i < endIndex; i++){
            keepAnnotations.push(imageIds[i]);
            loadAnnotationsToCache(imageIds[i]);
        }
        pruneAnnotationCache(keepAnnotations);
    }

    /**
     * Scroll image list to make current image visible.
     */
    function scrollImageList() {
        var imageLink = $('#annotate_image_link_' + gImageId);
        var list = $('#image_list');

        if (imageLink.offset() !== undefined) {
            var offset = list.offset().top;
            var linkTop = imageLink.offset().top;

            // link should be (roughly) in the middle of the element
            offset += parseInt(list.height() / 2);

            list.scrollTop(list.scrollTop() + linkTop - offset);
        }
    }

    /**
     * Handle the selection change of the annotation type.
     * Check if annotation type change is valid
     */

    function handleAnnotationTypeChange(newType) {

        if (viewer.selectionInstance.isSelecting
            && globals.editedAnnotationsId !== undefined) {

            // check if annotation type needs to be changed
            if (newType !== undefined && newType.id  != -1) {

                var annotation = globals.allAnnotations.filter(function (d) {
                    return d.id === globals.editedAnnotationsId;
                })[0];

                if (annotation.annotation_type.id !== newType.id ) {
                    // check if annotation type can be converted and save
                    if(tool.checkIfAnnotationTypeChangeIsValid(annotation.annotation_type.vector_type,
                        newType.vector_type)) {

                        annotation.annotation_type.id = newType.id;
                        tool.updateAnnotationType(annotation.id, gAnnotationTypes[newType.id]);

                        saveAnnotationAtServer(annotation)
                    } else { // reset annotation type on gui
                        $("#annotation_type_id").notify("Conversion to this type is not allowed.",
                            {position: "right", className: "error"});

                        document.getElementById('annotation_type_id').value = annotation.annotation_type.id;
                    }
                }
            } else {
                $("#annotation_type_id").notify("You have to choose a type for the annotation.",
                                            {position: "right", className: "error"});
            }
        }
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


        var annotationTypeId = gAnnotationKeyToIdLookUp[annotationTypeNumber];
        if (!OpenSeadragon.isFullScreen()) {
            $('#annotation_type_id').val(annotationTypeId);
        }
        gAnnotationType = gAnnotationTypes[annotationTypeId];

        handleAnnotationTypeChange(gAnnotationType);
    }

    function handleResize() {
        var image_node = document.getElementById('openseadragon1');
        var footer_node  = document.getElementById('footer_id');

        var image_rect = image_node.getBoundingClientRect();
        if (footer_node !== null) {
            var footer_rect = footer_node.getBoundingClientRect();

            var height = footer_rect.top - image_rect.top - 40; // window.innerHeight - (5 * footer_rect.height); //footer_rect.y - image_rect.y;
            var width = footer_rect.right - 45 - image_rect.left;

            image_node.style.height = height+ 'px';
            image_node.style.width = width+ 'px';

        }
    }

    function syncAnnotationFromServer(anno, tempid) {
        // update current annotations
        var index = globals.allAnnotations.findIndex((elem) => elem.id === anno.id);
        if (index === -1) {
            if (tempid !== false) {
                index = globals.allAnnotations.findIndex((elem) => elem.id === tempid);

                tool.updateName(tempid, anno.id);
                globals.allAnnotations[index] = anno;
            }
            globals.allAnnotations.push(anno)
        } else {
            globals.allAnnotations[index] = anno;
        }

        gAnnotationCache[gImageId] = globals.allAnnotations;
    }

    function CancelEdit(annotationId) {
        // delete temp annotation
        if (typeof annotationId === 'string') {
            tool.removeAnnotation(annotationId);

            globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                return value.id !== annotationId;
            });
            gAnnotationCache[gImageId] = globals.allAnnotations;
        }

        tool.handleEscape();
    }

    function verifyAndLoadNext() {
        // Save current annotation first
        if (globals.editedAnnotationsId !== undefined)
            finishAnnotation(globals.editedAnnotationsId);

        if (globals.allAnnotations.length == 0) {

            var annotationType = gAnnotationType;
            var action = 'create';
            var data = {
                annotation_type_id: annotationType.id,
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
                            $('#next_button').notify('The image has been verified.', "warn");
                            loadImageList();
                            loadAdjacentImage(1);
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
        } else {

            let data = {
                image_id: gImageId,
                state: 'accept'
            };

            $.ajax(API_IMAGES_BASE_URL + 'image/verify/', {
                type: 'POST',
                headers: gHeaders,
                dataType: 'json',
                data: JSON.stringify(data),
                success: function (data) {
                    loadImageList();
                    loadAdjacentImage(1);
                },
                error: function () {
                    displayFeedback($('#feedback_connection_error'));
                }
            })
        }
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

        //loadImageList();
        gImageList = getImageList();
        //preloadAnnotations(gImageId, gImageList);
        loadAnnotationTypeList(gImageSetId);
        scrollImageList();


        params = {image_set_id: gImageSetId};
        $.ajax(API_IMAGES_BASE_URL + 'imageset/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                data.image_set.images.forEach(x => gImageInformation[x.id] = {"width":x.width, "height": x.height,
                    "mpp": x.mpp, "objectivePower": x.objectivePower });

                displayImageList(data.image_set.images);

                if (data.image_set.main_annotation_type !== undefined &&
                    data.image_set.main_annotation_type !== null &&
                    data.image_set.main_annotation_type in gAnnotationTypes)
                    gAnnotationType = gAnnotationTypes[data.image_set.main_annotation_type];

                initTool(gImageId);
            },
            error: function () {
            }
        });

        // W3C standards do not define the load event on images, we therefore need to use
        // it from window (this should wait for all external sources including images)
        $(window).on('load', function () {
            handleResize();
        }());

        $('.annotation_value').on('input', function () {

        });
        $('select#filter_annotation_type').on('change', function (event) {
            gFilterType = $('#filter_annotation_type').children(':selected').val();
            loadImageList();
        });
        $('#filter_update_btn').on('click', function (event) {
            gFilterType = $('#filter_annotation_type').children(':selected').val();
            loadImageList();
        });

        $('#search_update_btn').on('click', function (event) {
            event.preventDefault();

            updateSearch(event);
        });

        $('select').on('change', function () {
            document.activeElement.blur();
        });
        $('#draw_annotations').on('change', handleShowAnnotationsToggle);
        $('select#annotation_type_id').on('change', function (event){

            annotationTypeId = $('#annotation_type_id').children(':selected').val();

            gAnnotationType = gAnnotationTypes[annotationTypeId];

            handleAnnotationTypeChange(gAnnotationType);

        });

        // register click events
        $(window).click(function (e) {
            handleMouseClick(e);
        });
        $('#cancel_edit_button').click(function () {
            CancelEdit(globals.editedAnnotationsId);
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
                    syncAnnotationFromServer(data.annotation, false);

                    $('#verify_annotation_button').notify('The annotation has been verified.', "info");
                },
                error: function () {
                    displayFeedback($('#feedback_connection_error'));
                }
            })
        });
        $('#save_button').click(function () {
            event.preventDefault();
            finishAnnotation(globals.editedAnnotationsId);
        });
        $('#reset_button').click(function () {
            event.preventDefault();
            tool.resetSelection();
        });
        $('#last_button').click(function (event) {
            event.preventDefault();
            loadAdjacentImage(-1);
        });
        $('#back_button').click(function (event) {
            event.preventDefault();

            CancelEdit(globals.editedAnnotationsId);
            loadAdjacentImage(-1);
        });
        $('#skip_button').click(function (event) {
            event.preventDefault();

            CancelEdit(globals.editedAnnotationsId);
            loadAdjacentImage(1);
        });
        $('#next_button').click(function (event) {
            event.preventDefault();

            verifyAndLoadNext();
        });
        $('.js_feedback').mouseover(function () {
            $(this).addClass('hidden');
        });
        document.getElementById("StrokeWidthSlider").oninput = function(event) {
            tool.updateStrokeWidth(event.srcElement.valueAsNumber);
        };

        //listen for click events from this style
        $(document).on('click', '.notifyjs-bootstrap-info', function(event) {
            var id  = $(this).text().split(" ")[1];
            tool.showItem(parseInt(id));
        });
        $(document).on('click', '.notifyjs-bootstrap-warn', function(event) {
            var id  = $(this).text().split(" ")[1];
            tool.showItem(parseInt(id));
        });

        $(document).on('mousemove touchmove', handleSelection);
        $(window).on('resize', handleResize);

        window.onpopstate = function (event) {
            if (event.state !== undefined && event.state !== null && event.state.imageId !== undefined) {
                loadAnnotateView(event.state.imageId, true);
            }
        };

        window.onbeforeunload = function (event) {
            $.ajax(API_IMAGES_BASE_URL + 'image/closed/' + gImageId, {
                type: 'GET',
                headers: gHeaders
            });
        };

        $(document).keydown(function (event) {
            if (event.target.id === "annotationRemark"
                || event.target.id == 'searchInputAnnotation')
                return;

            switch (event.keyCode) {
                case 16: // Shift
                    gShiftDown = true;
                    break;
                case 27: // Escape
                    CancelEdit(globals.editedAnnotationsId);

                    break;
                case 73: //i
                    break;
                case 75: //k
                    break;
                case 76: //l
                    break;
                case 74: //j
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
                case 96: //0
                    selectAnnotationType(0);
                    break;
                case 97: //1
                    selectAnnotationType(1);
                    break;
                case 98: //2
                    electAnnotationType(2);
                    break;
                case 99: //3
                    selectAnnotationType(3);
                    break;
                case 100: //4
                    selectAnnotationType(4);
                    break;
                case 101: //5
                    selectAnnotationType(5);
                    break;
                case 102: //6
                    selectAnnotationType(6);
                    break;
                case 103: //7
                    selectAnnotationType(7);
                    break;
                case 104: //8
                    selectAnnotationType(8);
                    break;
                case 105: //9
                    selectAnnotationType(9);
                    break;
            }
        });
        $(document).keyup(function (event) {
            if (event.target.id === "annotationRemark"
                || event.target.id == 'searchInputAnnotation')
                return;

            switch (event.keyCode) {
                case 8: //'DEL'
                    handleDelete(event);
                    break;
                case 13: //'enter'
                    finishAnnotation(globals.editedAnnotationsId);
                    break;
                case 16: // Shift
                    break;
                case 70: //f
                    verifyAndLoadNext();
                    break;
                case 68: //d
                    CancelEdit(globals.editedAnnotationsId);
                    loadAdjacentImage(1);

                    break;
                case 83: //s
                    CancelEdit(globals.editedAnnotationsId);
                    loadAdjacentImage(-1);

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
                    finishAnnotation(globals.editedAnnotationsId);
                    break;
                case 46: //'DEL'
                    handleDelete(event);
                    break;
                case 66: //b
                    break;
                case 67: //c
                    viewer.selectionInstance.toggleState();
                    break;
            }
        });
        $(document).one("ajaxStop", function () {
            //selectAnnotationType($('#main_annotation_type_id').html());
            if (editAnnotationId) {
                $('#annotation_edit_button_' + editAnnotationId).click();
            }
        });
    });
})();
