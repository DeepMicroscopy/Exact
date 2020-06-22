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

    var exact_viewer;
    var exact_imageset_viewer;

    function updateSearch() {

        var searchText = $('#searchInputAnnotation').val().trim().toLowerCase();

        var table = document.getElementById('annotationSearchResults');

        // remove all elements from table expect first
        while (table.childNodes.length > 3) {
            table.removeChild(table.lastChild);
        }


        if (searchText) {

            var searchFields = ['@id', '@label', '@first editor', '@last editor', '@remark']

            if (searchFields.some(searchField => searchText.includes(searchField))) {

                var all_annotations = globals.allAnnotations;

                var search_requests = searchText.split(';');

                search_requests.forEach(function (item, index) {
                    if (item.includes(':')) {

                        var field = item.split(':')[0];
                        var value = item.split(':')[1];

                        switch (field) {
                            case "@id":
                                if (!isNaN(parseInt(value)))
                                    value = parseInt(value);

                                all_annotations = all_annotations.filter(function (item) {
                                    return item.id === value;
                                });
                                break;

                            case "@label":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.annotation_type.name.toLowerCase() === value;
                                });
                                break;

                            case "@first editor":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.user.toLowerCase() === value;
                                });
                                break;

                            case "@last editor":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.last_editor.toLowerCase() === value;
                                });
                                break;

                            case "@verified":
                                all_annotations = all_annotations.filter(function (item) {
                                    item.is_verified.toString() === value;
                                });
                                break;

                            case "@verified":
                                all_annotations = all_annotations.filter(function (item) {
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
     * Edit an annotation.
     *
     * @param event
     * @param annotationElem the element which stores the edit button of the annotation
     * @param annotationId
     */
    function enableAnnotationEditing(annotation) {
        // ToDo: Remove

        //annotationElem = $(annotationElem);
        //let annotationTypeId = annotation.annotation_type.id;
        //$('#annotation_type_id').val(annotationTypeId);
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

            if (annotation.uploaded_media_files !== undefined) {
                for (const media of annotation.uploaded_media_files) {
                    if (media.media_file_type === 4) //Audio
                    {
                        var audio = document.getElementById('audio');
                        if (audio !== undefined) {
                            var source = document.getElementById('annotationAudio');
                            source.src = media.file
                            audio.load();

                            if ($('#autoplay_media').is(':checked'))
                                audio.play();
                            break;
                        }
                    }
                }
            }
        }


        //$('.annotate_button').prop('disabled', true);
    }

    function updatePlugins(imageId) {
        return;

        var bounds = viewer.viewport.getBounds(true);
        var imageRect = viewer.viewport.viewportToImageRectangle(bounds);

        let data = {
            image_id: imageId,
            options: {
                min_x: Math.round(imageRect.x),
                min_y: Math.round(imageRect.y),
                max_x: Math.round(imageRect.x + imageRect.width),
                max_y: Math.round(imageRect.y + imageRect.height)
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
            data: { 'values': JSON.stringify(data) },
            success: function (data) {
                var el = document.getElementById('statistics_tabs');
                if (el) {
                    for (plugin of data.plugins) {
                        var tab_name = plugin.id;

                        if (document.getElementById(tab_name + "_tab") === null) {

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
                                $("#GlobalAnnotation_" + gAnnotationTypes[key].id).prop("checked", false);
                        }
                    });

                    var total_count = 0;
                    for (anno_type of data.statistics) {
                        if (anno_type.id in gAnnotationTypes) {

                            if (anno_type.vector_type !== 7) {
                                total_count += anno_type.in_image_count;
                                document.getElementById(anno_type.name + '_' + anno_type.id).innerHTML =
                                    anno_type.in_image_count + ' / ' + anno_type.verified_count;
                            } else {
                                not_in_image = anno_type.not_in_image_count;
                                //  if the global annotation is not in db but active on GUI
                                // deactivate on GUI

                                var elem = document.getElementById('GlobalAnnotation_' + anno_type.id);
                                if (elem !== null) {
                                    if (not_in_image == 0 && $("#GlobalAnnotation_" + anno_type.id).prop("checked")) {
                                        $("#GlobalAnnotation_" + anno_type.id).prop("checked", false);
                                    } else if (not_in_image > 0 && $("#GlobalAnnotation_" + anno_type.id).prop("checked") === false) {
                                        $("#GlobalAnnotation_" + anno_type.id).prop("checked", true);
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


    function handleResize() {
        var image_node = document.getElementById('openseadragon1');
        var footer_node = document.getElementById('footer_id');

        var image_rect = image_node.getBoundingClientRect();
        if (footer_node !== null) {
            var footer_rect = footer_node.getBoundingClientRect();

            var height = footer_rect.top - image_rect.top - 40; // window.innerHeight - (5 * footer_rect.height); //footer_rect.y - image_rect.y;
            var width = footer_rect.right - 45 - image_rect.left;

            image_node.style.height = height + 'px';
            image_node.style.width = width + 'px';

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
        // get current environment
        gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();
        gImageId = parseInt($('#image_id').html());
        gImageSetId = parseInt($('#image_set_id').html());
        gHeaders = {
            "Content-Type": 'application/json',
            "X-CSRFTOKEN": gCsrfToken
        };

        let image_url = window.location.origin;
        let username = document.getElementById("username").innerText.trim();

        exact_imageset_viewer = new EXACTImageSetViewer(gImageSetId, gImageId, image_url, gHeaders, username);


        // W3C standards do not define the load event on images, we therefore need to use
        // it from window (this should wait for all external sources including images)
        $(window).on('load', function () {
            handleResize();
        }());

        $('#search_update_btn').on('click', function (event) {
            event.preventDefault();

            updateSearch(event);
        });

        $('.js_feedback').mouseover(function () {
            $(this).addClass('hidden');
        });

        $("#ContrastSlider").slider();
        $("#ContrastSlider").on("change", updateFiltersOnImage);
        $("#ContrastSlider-enabled").click(function () {
            if (this.checked) { $("#ContrastSlider").slider("enable"); updateFiltersOnImage(null); }
            else { $("#ContrastSlider").slider("disable"); updateFiltersOnImage(null); }
        });

        $("#CLAHESlider").slider();
        $("#CLAHESlider").on("change", updateFiltersOnImage);
        $("#CLAHESlider-enabled").click(function () {
            if (this.checked) { $("#CLAHESlider").slider("enable"); updateFiltersOnImage(null); }
            else { $("#CLAHESlider").slider("disable"); updateFiltersOnImage(null); }
        });

        $("#BRIGHTNESSSlider").slider();
        $("#BRIGHTNESSSlider").on("change", updateFiltersOnImage);
        $("#BRIGHTNESSSlider-enabled").click(function () {
            if (this.checked) { $("#BRIGHTNESSSlider").slider("enable"); updateFiltersOnImage(null); }
            else { $("#BRIGHTNESSSlider").slider("disable"); updateFiltersOnImage(null); }
        });

        $("#THRESHOLDINGSlider").slider();
        $("#THRESHOLDINGSlider").on("change", updateFiltersOnImage);
        $("#THRESHOLDINGSlider-enabled").click(function () {
            if (this.checked) { $("#THRESHOLDINGSlider").slider("enable"); updateFiltersOnImage(null); }
            else { $("#THRESHOLDINGSlider").slider("disable"); updateFiltersOnImage(null); }
        });

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
        $(document).on('click', '.notifyjs-bootstrap-info', function (event) {
            if ($(this).text().trim() === "Start Screening") {
                var result = globals.screeningTool.getCurrentPosition();
                viewCoordinates(result['x_min'], result['y_min'], result['x_max'], result['y_max']);

            } else {
                var id = parseInt($(this).text().split(" ")[1]);
                var index = globals.allAnnotations.findIndex((elem) => elem.id === id);
                tool.showItem(globals.allAnnotations[index]);
            }
        });
        $(document).on('click', '.notifyjs-bootstrap-warn', function (event) {
            var id = parseInt($(this).text().split(" ")[1]);
            var index = globals.allAnnotations.findIndex((elem) => elem.id === id);
            tool.showItem(globals.allAnnotations[index]);
        });

        $(window).on('resize', handleResize);

        window.onbeforeunload = function (event) {
            exact_viewer.imageClosed();
        };

        $(document).keydown(function (event) {
            if (event.target.id === "TEXTAREA"
                || event.target.nodeName == 'INPUT')
                return;

            switch (event.keyCode) {
                case 16: // Shift
                    gShiftDown = true;
                    break;
                case 73: //i
                    break;
                case 75: //k
                    break;
                case 76: //l
                    break;
                case 74: //j
                    break;
            }
        });
        $(document).keyup(function (event) {
            if (event.target.id === "TEXTAREA"
                || event.target.nodeName == 'INPUT')
                return;

            switch (event.keyCode) {
                case 16: // Shift
                    break;
                case 70: //f
                    verifyAndLoadNext();
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
            }
        });
    });
})();
