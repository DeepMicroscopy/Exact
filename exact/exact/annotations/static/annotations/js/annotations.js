globals = {
    editedAnnotation: undefined,
    editActiveContainer: {},
    drawAnnotations: true,
    allAnnotations: undefined,
    isSelecting: false,
    screeningTool: undefined
};


(function () {
    const API_1_ADMINISTRATION_BASE_URL = '/api/v1/administration/';
    
    const API_1_IMAGES_BASE_URL = '/api/v1/images/';
    const API_1_IMAGES_FIELDS = 'fields=id,name&';


    const API_1_ANNOTATIONS_BASE_URL = '/api/v1/annotations/';
    const API_1_ANNOTATION_EXPAND = 'expand=user,last_editor,uploaded_media_files&';
    const API_1_ANNOTATION_FIELDS = 'fields=image,annotation_type,id,vector,deleted,description,verified_by_user,uploaded_media_files,unique_identifier,user.id,user.username,last_editor.id,last_editor.username&';

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
    var gAnnotationType = undefined;
    var gAnnotationTypes = {};
    var gAnnotationKeyToIdLookUp = {};
    let gAnnotationCache = {};
    let gImageInformation = {};
    
    var gShiftDown;

    var tool;
    var exact_viewer;

    function finishAnnotation(annotation) {

        if (annotation !== undefined) {

            saveAnnotationAtServer(annotation);
            exact_viewer.tool.resetSelection();
        }
    }

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
                                   return item.user.toLowerCase() === value;
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
                        var id = parseInt(event.currentTarget.innerText);
                        annotation = globals.allAnnotations.filter(function (d) {
                            return d.id === id;
                        })[0]
                        tool.showItem(annotation);
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
                    name_link.setAttribute('href', `/users/user/${item.user.id}/`);
                    name_link.textContent = item.user.username;
                    column.appendChild(name_link);
                    row.appendChild(column);

                    // First Editor
                    var column = document.createElement("th");
                    name_link = document.createElement("a");
                    name_link.setAttribute('href', `/users/user/${item.last_editor.id}/`);
                    name_link.textContent = item.last_editor.username;
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

        var action = 'POST';
        var url = API_1_ANNOTATIONS_BASE_URL + "annotations/";

        var data = {
            deleted: annotation.deleted,
            annotation_type: annotation.annotation_type.id,
            image: annotation.image,
            vector: tool.getAnnotationVector(annotation.unique_identifier),
            unique_identifier: annotation.unique_identifier
        };

        if (!OpenSeadragon.isFullScreen())
            data.description = document.getElementById('annotationRemark').value;

        if (annotation.id !== -1) {
            // edit instead of create
            action = 'PATCH';
            data.id = annotation.id;

            url = url + annotation.id + "/";
        }

        url = url + "?" + API_1_ANNOTATION_EXPAND + API_1_ANNOTATION_FIELDS;

        $('.js_feedback').stop().addClass('hidden');
        $.ajax(url, {  type: action, headers: gHeaders, dataType: 'json', data: JSON.stringify(data), success: function (annotation, textStatus, jqXHR) {
                if (jqXHR.status === 200) {
                    displayFeedback($('#feedback_annotation_updated'));
                } else if (jqXHR.status === 201) {
                    displayFeedback($('#feedback_annotation_created'));
                }

                syncAnnotationFromServer(annotation);

                loadStatistics(gImageId);
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }

    function globalAnnotationChanged(event) {

        active = $("#"+event.target.id).prop("checked")
        anno_type_id = parseInt(event.target.getAttribute('data-annotation_type-id'));

        annotation = globals.allAnnotations.filter(function (value, index, arr) {
            return value.annotation_type.id === anno_type_id;
        })[0];

        // create new global annotation
        if (annotation === undefined) {
            annotation = {
                annotation_type: gAnnotationTypes[anno_type_id],
                id: -1,
                vector: null,
                user: {id: null, username: "you"},
                last_editor: {id: null, username: "you"},
                image: gImageId,
                unique_identifier: tool.uuidv4()
            }
        }

        if (active) {
            annotation.deleted = false;
        } else {
            // delete global annotation
            annotation.deleted = true;
        } 
        saveAnnotationAtServer(annotation);
    }

    function handleAnnotationVisibilityChanged(event) {
        var annotation_type_id = parseInt(event.target.getAttribute('data-annotation_type-id'));
        tool.updateVisbility(annotation_type_id, event.currentTarget.checked);
    }

    function displayAnnotationTypeOptions(annotationTypeList) {
        // TODO: empty the options?
        let annotationTypeFilterSelect = $('#filter_annotation_type');
        let annotationTypeToolSelect = $('#annotation_type_id');

        let key = 0
        for (annotationType of annotationTypeList.sort(function(a, b){
                return a.sort_order - b.sort_order;})) {
            if (annotationType.vector_type !== 7) // filter global annotations
            {

                gAnnotationKeyToIdLookUp[key] = annotationType.id;

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

                key += 1;
            }

            annotationTypeFilterSelect.append($('<option/>', {
                name: annotationType.name,
                value: annotationType.id,
                html: `${annotationType.name} (${annotationType.product.name})`
            }));            
        }
    }

    /**
     * Delete an annotation.
     *
     * @param event
     * @param annotationId
     */
    function deleteAnnotation(event, annotation) {
        //  if annotation was not send to server stop now
        if (annotation.id === -1) {
            displayFeedback($('#feedback_annotation_deleted'));
        } else {
            $('.js_feedback').stop().addClass('hidden');

            annotation.deleted = true;
            saveAnnotationAtServer(annotation);
        }

        tool.removeAnnotation(annotation.unique_identifier);
        tool.resetSelection();
    }

    /**
     * Highlight one annotation in a different color
     * @param annotationTypeId
     * @param annotationId
     */

    /**
     * Display an image from the image cache or the server.
     *
     * @param imageId
     */
    function displayImage(imageId) {
        imageId = parseInt(imageId);

        //if new imageid equals old image id do nothing
        if (exact_viewer !== undefined 
                && exact_viewer.imageId === imageId)
            return

        if (exact_viewer !== undefined)
            exact_viewer.destroy();

        // return if imageid is not valid
        if (gImageList.indexOf(imageId) === -1) {
            return
        } 

        gImageId = imageId;
        imageInformation = gImageInformation[imageId]

        const options = { };

        let image_url = window.location.origin;
        let username = document.getElementById("username").innerText.trim();
        exact_viewer = EXACTViewer.factoryCreateViewer(image_url, imageId, options, imageInformation, gAnnotationTypes, gHeaders, username);

        // register callbacks
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

                CancelEdit(globals.editedAnnotation);

                image_id = $(this).data('imageid');

                if (image_id !== gImageId)
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

        $('#annotation_type_id').val(annotation.annotation_type.id);
        gAnnotationType = annotation.annotation_type;

        globals.editedAnnotation = annotation;
        globals.editActiveContainer.removeClass('hidden');


        $('.js_feedback').stop().addClass('hidden');

        // highlight currently edited annotation
        $('.annotation').removeClass('alert-info');

        $('#annotation_buttons').show();

        $('#AnnotationInformation').show();

        if (!OpenSeadragon.isFullScreen()) {
            document.getElementById('annotationFirstEditor')
                .setAttribute('href', `/users/user/${annotation.user.id}/`);
            document.getElementById('annotationFirstEditor').textContent = annotation.user.username;

            document.getElementById('annotationLastEditor')
                .setAttribute('href', `/users/user/${annotation.last_editor.id}/`);
            document.getElementById('annotationLastEditor').textContent = annotation.last_editor.username;

            document.getElementById('annotationRemark').value = annotation.description;

            if (annotation.is_verified !== undefined)
                document.getElementById('annotationVerified').innerText = annotation.verified_by_user.toString();

            document.getElementById('annotationUniqueID').textContent = annotation.id;
            document.getElementById('annotationUniqueID').onclick = function (event) {
                var id = parseInt(event.currentTarget.innerText);
                var annotation = globals.allAnnotations.filter(function (d) {
                    return d.id === id;
                })[0];
                tool.showItem(annotation);
            };

            if (annotation.uploaded_media_files !== undefined) 
            {
                for (const media of annotation.uploaded_media_files) {
                    if (media.media_file_type === 4) //Audio
                    {
                        var audio = document.getElementById('audio');
                        if (audio !== undefined)
                        {
                            var source = document.getElementById('annotationAudio');
                            source.src = media.file
                            audio.load(); 

                            if ( $('#autoplay_media').is(':checked'))
                                audio.play();
                            break;
                        }
                    }
                }
            }
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
        return;

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

        if (globals.screeningTool !== undefined && globals.screeningTool.getImageId() === imageId) {
            data.options['current_index'] = globals.screeningTool.getCurrentIndx();
        }

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
        return;

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

                        if (gAnnotationTypes[key].vector_type != 7) {
                            var elem = document.getElementById(gAnnotationTypes[key].name + '_' + gAnnotationTypes[key].id);
                            if (elem !== null)
                                elem.innerHTML = 0;
                        } else {
                            var elem = document.getElementById('GlobalAnnotation_' + gAnnotationTypes[key].id);
                            if (elem !== null)
                                $("#GlobalAnnotation_"+gAnnotationTypes[key].id).prop("checked", false);
                        }
                    });

                    var total_count = 0;
                    for (anno_type of data.statistics) {
                        if (anno_type.id in gAnnotationTypes ) {

                            if (anno_type.vector_type !== 7) {
                                total_count += anno_type.in_image_count;
                                document.getElementById(anno_type.name + '_' + anno_type.id).innerHTML =
                                    anno_type.in_image_count + ' / ' + anno_type.verified_count;
                            } else {
                                not_in_image = anno_type.not_in_image_count;
                                //  if the global annotation is not in db but active on GUI
                                // deactivate on GUI

                                var elem = document.getElementById('GlobalAnnotation_'+anno_type.id);
                                if (elem !== null) {
                                    if (not_in_image == 0 && $("#GlobalAnnotation_"+anno_type.id).prop("checked")) {
                                        $("#GlobalAnnotation_"+anno_type.id).prop("checked", false);
                                    }else if (not_in_image > 0 && $("#GlobalAnnotation_"+anno_type.id).prop("checked") === false) {
                                        $("#GlobalAnnotation_"+anno_type.id).prop("checked", true);
                                    }
                                }
                            }
                        }
                    }

                    var total_elem = document.getElementById('statistics_total_annotations');
                    if (total_elem !== null)
                        total_elem.innerHTML = total_count;
                },
                error: function () {

                }
            });

            updatePlugins(imageId);
        } else {
            Object.keys(gAnnotationTypes).forEach(function (key) {
                var elem = document.getElementById(gAnnotationTypes[key].name + '_' + gAnnotationTypes[key].id);
                if (elem !== null)
                    elem.innerHTML = 0;
            });
        }
    }

    /**
     * Load the annotation view for another image.
     *
     * @param imageId
     * @param fromHistory
     */
    function loadAnnotateView(imageId) {
        globals.editedAnnotation = undefined;

        imageId = parseInt(imageId);

        if (imageId > 0) {
            if (gAnnotationType !== undefined)
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

        }
        else {
            // if the image set is empty
            loadStatistics(imageId);
            displayImage(imageId);
        }
    }

    /**
     * Load the image list from tye server applying a new filter.
     */
    function loadImageList(filter_type = "ALL") {

        url = API_1_IMAGES_BASE_URL + "images/?limit=10000&" 
        url += API_1_IMAGES_FIELDS

        filter = `image_set=${gImageSetId}&`;
        if (filter_type === "NoAnnotations")
            filter += `num_annotations_max=0&`;
        if (filter_type == "ComputerGenerated")
            filter += `image_type=1&`;
        if (filter_type == "Verified")
            filter += `verified=True&`;
        if (filter_type == "Unverified")
            filter += `verified=False&`;
        if (isNaN(parseInt(filter_type)) === false)
            filter += `annotation_type=${parseInt(filter_type)}&`;

        url += filter;
        
        $.ajax(url, {type: 'GET', headers: gHeaders, dataType: 'json',
            success: function (images, textStatus, jqXHR) {

                if (images.count === 0) {
                    // redirect to image set view.
                    if (filter_type ===  "Unverified") {
                        $("#filter_annotation_type").notify("All images are verified. :)",
                            {position: "top", className: "error", autoHide: false});

                    } else {
                        $("#filter_annotation_type").notify("The image set is empty with that filter applied.",
                            {position: "top", className: "error"});
                    }
                }
                displayImageList(images.results);
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

    function handleAnnotationTypeChange(annotation, newType) {

        if (viewer.selectionInstance.isSelecting
            && globals.editedAnnotation !== undefined) {

            // check if annotation type needs to be changed
            if (newType !== undefined && newType.id  != -1) {

                if (annotation.annotation_type.id !== newType.id ) {
                    // check if annotation type can be converted and save
                    if(tool.checkIfAnnotationTypeChangeIsValid(annotation.annotation_type.vector_type,
                        newType.vector_type)) {

                        annotation.annotation_type = newType;
                        tool.updateAnnotationType(annotation.unique_identifier, gAnnotationTypes[newType.id]);

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
        if (globals.editedAnnotation === undefined)
            return;

        deleteAnnotation(event, globals.editedAnnotation);
    }

    function selectAnnotationType(annotationTypeNumber) {
        if (typeof annotationTypeNumber == "undefined")
            return


        var annotationTypeId = gAnnotationKeyToIdLookUp[annotationTypeNumber];
        if (!OpenSeadragon.isFullScreen()) {
            $('#annotation_type_id').val(annotationTypeId);
        }
        gAnnotationType = gAnnotationTypes[annotationTypeId];


        handleAnnotationTypeChange(globals.editedAnnotation, gAnnotationType);
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

    function syncAnnotationFromServer(anno) {
        // update current annotations

        url = API_1_ANNOTATIONS_BASE_URL + "annotations/" + anno.id + "/?" + API_1_ANNOTATION_EXPAND + API_1_ANNOTATION_FIELDS;
        $.ajax(url,  {type: 'GET',  headers: gHeaders, dataType: 'json', success: function (anno) {

            anno.annotation_type = gAnnotationTypes[anno.annotation_type]
            if (anno.image === gImageId) {
                var index = globals.allAnnotations.findIndex((elem) => elem.unique_identifier === anno.unique_identifier);
                if (index === -1) {
                    globals.editedAnnotation = anno;
    
                    globals.allAnnotations.push(anno)
                } else {
                    globals.allAnnotations[index] = anno;
                }
    
                gAnnotationCache[gImageId] = globals.allAnnotations;
            } else if (anno.image in gAnnotationCache) {
                image_id = anno.image;
    
                var index = gAnnotationCache[image_id].findIndex((elem) => elem.unique_identifier === anno.unique_identifier);
                if (index === -1) {
                    gAnnotationCache[image_id].push(anno)
                } else {
                    gAnnotationCache[image_id][index] = anno;
                }
            }
        }});
    }

    function CancelEdit(annotation) {
        // delete temp annotation
        if (annotation !== undefined && annotation.id === -1 && 
            exact_viewer !== undefined) {
            exact_viewer.tool.removeAnnotation(annotation.unique_identifier);

            globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                return value.unique_identifier !== annotation.unique_identifier;
            });
            gAnnotationCache[gImageId] = globals.allAnnotations;
        }
        if (exact_viewer !== undefined)
            exact_viewer.tool.handleEscape();
    }

    function verifyAndLoadNext() {
        // Save current annotation first
        if (globals.editedAnnotation !== undefined)
            finishAnnotation(globals.editedAnnotation);

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
                        annotation_id: data.annotations.id,
                        state: 'accept',
                    };

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

    function changeAnnotationTypeByButton(event) {
        var annotationTypeId = parseInt(event.target.dataset.type_id);

        if (!OpenSeadragon.isFullScreen()) {
            $('#annotation_type_id').val(annotationTypeId);
        }

        gAnnotationType = gAnnotationTypes[annotationTypeId];

        handleAnnotationTypeChange(globals.editedAnnotation, gAnnotationType);
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
        //loadAnnotationTypeList(gImageSetId);
        scrollImageList();

        $.ajax(API_1_IMAGES_BASE_URL + 'image_sets/'+ gImageSetId + '/?expand=product_set.annotationtype_set&omit=images,product_set.imagesets', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (image_set, textStatus, jqXHR) {

                for (product of image_set.product_set) {
                    for (annotation_type of product.annotationtype_set) {
                        annotation_type.product = {id: product.id, name: product.name}

                        gAnnotationTypes[annotation_type.id] = annotation_type;

                        if (annotation_type.vector_type == 7)
                            $('#GlobalAnnotation_'+annotation_type.id).change(globalAnnotationChanged)
                        else {
                            $('#DrawCheckBox_'+annotation_type.id).change(handleAnnotationVisibilityChanged)
                            $('#annotation_type_id_button_'+annotation_type.id).click(changeAnnotationTypeByButton)

                        }
                    }
                }
                displayAnnotationTypeOptions(Object.values(gAnnotationTypes));

                if (image_set.main_annotation_type !== undefined){
                    gAnnotationType = gAnnotationTypes[image_set.main_annotation_type];
                } else {
                    // TODO: Assign first non global annotation with the smallest sort order
                }
            },
            error: function () {
            }
        });

        $.ajax(API_1_IMAGES_BASE_URL + 'images/?image_set='+gImageSetId+'&fields=id,width,height,mpp,objectivePower,name,frames,depth&limit=100000', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                data.results.forEach(x => gImageInformation[x.id] = {"id":x.id, "width":x.width, "height": x.height,
                    "mpp": x.mpp, "objectivePower": x.objectivePower, 'depth': x.depth, 'frames': x.frames });

                displayImageList(data.results);

                loadAnnotateView(gImageId);
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
            var filter_type = $('#filter_annotation_type').children(':selected').val();
            loadImageList(filter_type);
        });
        $('#filter_update_btn').on('click', function (event) {
            var filter_type = $('#filter_annotation_type').children(':selected').val();
            loadImageList(filter_type);
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

            handleAnnotationTypeChange(globals.editedAnnotation, gAnnotationType);

        });

        // register click events
        $('#cancel_edit_button').click(function () {
            CancelEdit(globals.editedAnnotation);
        });
        $('#delete_annotation_button').click(function () {
            deleteAnnotation(undefined, globals.editedAnnotation);
        });
        $('#verify_annotation_button').click(function () {
            event.preventDefault();

            let data_val = {
                annotation_id: globals.editedAnnotation,
                state: 'accept',
            };

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
            finishAnnotation(globals.editedAnnotation);
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

            CancelEdit(globals.editedAnnotation);
            loadAdjacentImage(-1);
        });
        $('#skip_button').click(function (event) {
            event.preventDefault();

            CancelEdit(globals.editedAnnotation);
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


        $("#ContrastSlider").slider();
        $("#ContrastSlider").on("change", updateFiltersOnImage);
        $("#ContrastSlider-enabled").click(function() { 
            if(this.checked) { $("#ContrastSlider").slider("enable");  updateFiltersOnImage(null);} 
            else { $("#ContrastSlider").slider("disable");  updateFiltersOnImage(null);}
        });

        $("#CLAHESlider").slider();
        $("#CLAHESlider").on("change", updateFiltersOnImage);
        $("#CLAHESlider-enabled").click(function() { 
            if(this.checked) { $("#CLAHESlider").slider("enable");  updateFiltersOnImage(null);} 
            else { $("#CLAHESlider").slider("disable");  updateFiltersOnImage(null);}
        });

        $("#BRIGHTNESSSlider").slider();
        $("#BRIGHTNESSSlider").on("change", updateFiltersOnImage);
        $("#BRIGHTNESSSlider-enabled").click(function() { 
            if(this.checked) { $("#BRIGHTNESSSlider").slider("enable"); updateFiltersOnImage(null);} 
            else { $("#BRIGHTNESSSlider").slider("disable");  updateFiltersOnImage(null);}
        });

        $("#THRESHOLDINGSlider").slider();
        $("#THRESHOLDINGSlider").on("change", updateFiltersOnImage);
        $("#THRESHOLDINGSlider-enabled").click(function() { 
            if(this.checked) { $("#THRESHOLDINGSlider").slider("enable"); updateFiltersOnImage(null);} 
            else { $("#THRESHOLDINGSlider").slider("disable"); updateFiltersOnImage(null);}
        });

        $("#Invert-enabled").click(updateFiltersOnImage);
        $("#GREYSCALE-enabled").click(updateFiltersOnImage);
        $("#Red-enabled").click(updateFiltersOnImage);
        $("#Green-enabled").click(updateFiltersOnImage);
        $("#Blue-enabled").click(updateFiltersOnImage);

        function updateFiltersOnImage(event) {

            let processors = []

            if ($("#Red-enabled").prop("checked") == false || 
                $("#Green-enabled").prop("checked") == false || 
                $("#Blue-enabled").prop("checked") == false)
                processors.push(OpenSeadragon.Filters.DRAW_RGB($("#Red-enabled").prop("checked"), 
                        $("#Green-enabled").prop("checked"), 
                        $("#Blue-enabled").prop("checked")))

            if ($("#Invert-enabled").prop("checked"))
                processors.push(OpenSeadragon.Filters.INVERT())

            if ($("#GREYSCALE-enabled").prop("checked"))
                processors.push(OpenSeadragon.Filters.GREYSCALE())

            if ($("#BRIGHTNESSSlider-enabled").prop("checked"))
                processors.push(OpenSeadragon.Filters.BRIGHTNESS(parseInt($("#BRIGHTNESSSlider").val())))
            
            if ($("#ContrastSlider-enabled").prop("checked"))
                processors.push(OpenSeadragon.Filters.CONTRAST(parseFloat($("#ContrastSlider").val())))

            if ($("#THRESHOLDINGSlider-enabled").prop("checked"))
                processors.push(OpenSeadragon.Filters.THRESHOLDING(parseInt($("#THRESHOLDINGSlider").val())))

            if ($("#CLAHESlider-enabled").prop("checked"))
                processors.push(OpenSeadragon.Filters.CLAHE(parseInt($("#CLAHESlider").val())))
         
            viewer.setFilterOptions({ filters: { processors: processors } });
        }


        //listen for click events from this style
        $(document).on('click', '.notifyjs-bootstrap-info', function(event) {
            if ($(this).text().trim()  === "Start Screening") {
                var result = globals.screeningTool.getCurrentPosition();
                viewCoordinates(result['x_min'], result['y_min'], result['x_max'], result['y_max']);

            } else {
                var id  = parseInt($(this).text().split(" ")[1]);
                var index = globals.allAnnotations.findIndex((elem) => elem.id === id);
                tool.showItem( globals.allAnnotations[index]);
            }
        });
        $(document).on('click', '.notifyjs-bootstrap-warn', function(event) {
            var id  = parseInt($(this).text().split(" ")[1]);
            var index = globals.allAnnotations.findIndex((elem) => elem.id === id);
            tool.showItem( globals.allAnnotations[index]);
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
            if (event.target.id === "TEXTAREA"
                || event.target.nodeName == 'INPUT')
                return;

            switch (event.keyCode) {
                case 16: // Shift
                    gShiftDown = true;
                    break;
                case 27: // Escape
                    CancelEdit(globals.editedAnnotation);

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
                    selectAnnotationType(2);
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
            if (event.target.id === "TEXTAREA"
                || event.target.nodeName == 'INPUT')
                return;

            switch (event.keyCode) {
                case 8: //'DEL'
                    handleDelete(event);
                    break;
                case 13: //'enter'
                    finishAnnotation(globals.editedAnnotation);
                    break;
                case 16: // Shift
                    break;
                case 70: //f
                    verifyAndLoadNext();
                    break;
                case 69: //e load next image
                    CancelEdit(globals.editedAnnotation);
                    loadAdjacentImage(1);

                    break;
                case 81: //q load last image
                    CancelEdit(globals.editedAnnotation);
                    loadAdjacentImage(-1);

                    break;
                case 65: //a left tile
                    var result = globals.screeningTool.moveLeft();
                    viewCoordinates(result['x_min'], result['y_min'], result['x_max'], result['y_max']);

                    break;
                case 87: //w up tile
                    var result = globals.screeningTool.moveUp();
                    viewCoordinates(result['x_min'], result['y_min'], result['x_max'], result['y_max']);

                    break;

                case 83: //s down tile
                    var result = globals.screeningTool.moveDown();
                    viewCoordinates(result['x_min'], result['y_min'], result['x_max'], result['y_max']);

                    break;
                case 68: //d right tile
                    var result = globals.screeningTool.moveRight();
                    viewCoordinates(result['x_min'], result['y_min'], result['x_max'], result['y_max']);

                    break;

                case 82: //r
                    $('#reset_button').click();
                    break;
                case 86: //'v'
                    finishAnnotation(globals.editedAnnotation);
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
