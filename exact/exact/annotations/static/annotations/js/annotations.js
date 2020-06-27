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
        let user_id = parseInt($('#user_id').html());

        exact_imageset_viewer = new EXACTImageSetViewer(gImageSetId, gImageId, image_url, gHeaders, user_id);


        // W3C standards do not define the load event on images, we therefore need to use
        // it from window (this should wait for all external sources including images)
        $(window).on('load', function () {
            handleResize();
        }());

        $('.js_feedback').mouseover(function () {
            $(this).addClass('hidden');
        });


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
