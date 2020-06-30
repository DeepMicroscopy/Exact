(function () {

    // TODO: Find a solution for url resolvings

    var gCsrfToken;
    var gHeaders;
    var gImageId;
    var gImageSetId;

    var exact_viewer;
    var exact_imageset_viewer;

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
        let url_parameters = decodeURIComponent(window.location.search.substring(1)).split('&');

        // convert array to dict 
        url_parameters = Object.assign({}, ...url_parameters.map((x) => ({[x.split("=")[0]]: x.split("=")[1]})));

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

        exact_imageset_viewer = new EXACTImageSetViewer(gImageSetId, gImageId, image_url, gHeaders, user_id, url_parameters);


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
            //exact_viewer.imageClosed();
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
            }
        });
    });
})();
