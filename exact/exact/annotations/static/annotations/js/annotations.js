function include_server_subdir(url) {
    sub_dir =  window.location.pathname.split("/annotations")[0]
    if (sub_dir === "") { return url } else { return sub_dir + url }
}


(function () {

    // TODO: Find a solution for url resolvings

    var gCsrfToken;
    var gHeaders;
    var gImageId;
    var gImageSetId;

    var exact_viewer;
    var exact_imageset_viewer;

    $(function () {
        let url_parameters = decodeURIComponent(window.location.search.substring(1)).split('&');

        // convert array to dict 
        url_parameters = Object.assign({}, ...url_parameters.map((x) => ({ [x.split("=")[0]]: x.split("=")[1] })));

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

        // Expand Annotations Menu
        $('#loadAnnotationMenu').click(function (event) {
            $('#annotationMenu').collapse('toggle');
        });

        // Expand Thumbnail Grid
        $('#loadImagesetThumbnails').click(function (event) {
            $('#imagesetThumbnails').collapse('toggle');
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
            }
        });
    });
})();
