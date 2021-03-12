class EXACTRegistrationHandler {

    constructor(viewer, registration_pair, browser_sync, ) {

        this.registration_pair = registration_pair;
        this.browser_sync = browser_sync;
        this.viewer = viewer;

        let matrix = registration_pair.transformation_matrix;
        this.homography = cv.matFromArray(3, 3, cv.CV_64FC1, 
            [matrix.t_00, matrix.t_01, matrix.t_02, 
                matrix.t_10, matrix.t_11, matrix.t_12,
                matrix.t_20, matrix.t_21, matrix.t_22]);

        this.initUiEvents();
        this.initBrowserSycEvents();
        this.updateHomographyUI();
    }


    initBrowserSycEvents() {

        this.browser_sync.getChannelObject("ReceiveRegistrationImage").onmessage = 
                    this.receiveRegistrationImage.bind(this);

        this.browser_sync.getChannelObject("SendRegistrationImage").onmessage = 
                    this.sendRegistrationImage.bind(this);
    }

    initUiEvents() {

        $('#update_browser_sync_images_btn').click(this.updateRegistrationJS.bind(this))

    }


    updateRegistrationJS(event) {

        this.browser_sync.getChannelObject("SendRegistrationImage").postMessage({
            "image": $("select#sync_browser_image").val()
        });

    }

    sendRegistrationImage(event) {

        if (document.visibilityState == 'visible' && 
            event.data.image === this.registration_pair.target_image.name){

            // Original image coordinates
			let bounds = this.viewer.viewport.getBounds(true);
            let imageRect = this.viewer.viewport.viewportToImageRectangle(bounds);

            
            //  view coordinates
            var width = this.viewer.canvas.children[0].width; 
            var height = this.viewer.canvas.children[0].height;

            //var canvas = this.viewer.canvas.children[0].getContext('2d');
            //var imgData = canvas.getImageData(0, 0, width , height);

            this.browser_sync.getChannelObject("ReceiveRegistrationImage").postMessage({
                "image_name": this.registration_pair.target_image.name,
                "imageRect": imageRect,
                "width": width,
                "height": height, 
                //"imgData": imgData
            });
        }
    }

    receiveRegistrationImage(event) {
        // https://stackoverflow.com/questions/62882219/i-need-guidance-on-how-to-convert-the-creation-of-a-matrix-via-python-numpy-to-j
        // https://github.com/haroundjudzman/Exact/blob/inferenceClassificationTensorflow/exact/exact/annotations/static/annotations/js/inference_tool.js


        if (document.visibilityState == 'visible' && 
            event.data.image_name === this.registration_pair.source_image.name){

            var target_rect = event.data.imageRect;

            let bounds = this.viewer.viewport.getBounds(true);
            var source_rect = this.viewer.viewport.viewportToImageRectangle(bounds);


            this.homography = this.calcHomographyFromBoundary(target_rect, source_rect);

            this.updateHomographyUI();
        }
    }

    transformAffine(x, y) {
       var new_x = Math.round(parseFloat($('#registration00').val()) * x + 
                        parseFloat($('#registration01').val()) * y + parseFloat($('#registration02').val()))

        var new_y = Math.round(parseFloat($('#registration10').val()) * x + 
                        parseFloat($('#registration11').val()) * y + parseFloat($('#registration12').val()))     


        return [new_x, new_y];
    }

    calcHomographyFromBoundary(source_boundary, target_boundary) {
        // source points
        let x_min_s = source_boundary.x;
        let y_min_s = source_boundary.y;
        let x_max_s = source_boundary.x + source_boundary.width;
        let y_max_s = source_boundary.y + source_boundary.height;;

        // target points
        let x_min_t = target_boundary.x;
        let y_min_t = target_boundary.y;
        let x_max_t = target_boundary.x + target_boundary.width;
        let y_max_t = target_boundary.y + target_boundary.height;;

        let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [x_min_s, y_min_s, x_min_s, y_max_s, x_max_s, y_min_s, x_max_s, y_max_s]);
        let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [x_min_t, y_min_t, x_min_t, y_max_t, x_max_t, y_min_t, x_max_t, y_max_t]);

        return cv.findHomography(srcTri, dstTri)
    }

    updateHomographyUI() {

        $('#registration00').val(this.homography.doubleAt(0,0));
        $('#registration01').val(this.homography.doubleAt(0,1));
        $('#registration02').val(this.homography.doubleAt(0,2));

        $('#registration10').val(this.homography.doubleAt(1,0));
        $('#registration11').val(this.homography.doubleAt(1,1));
        $('#registration12').val(this.homography.doubleAt(1,2));

        $('#registration20').val(this.homography.doubleAt(2,0));
        $('#registration21').val(this.homography.doubleAt(2,1));
        $('#registration22').val(this.homography.doubleAt(2,2));

    }    


    destroy() {

        $('#registration00').val(0);
        $('#registration01').val(0);
        $('#registration02').val(0);

        $('#registration10').val(0);
        $('#registration11').val(0);
        $('#registration12').val(0);

        $('#registration20').val(0);
        $('#registration21').val(0);
        $('#registration22').val(0);

        $("#update_browser_sync_images_btn").off("click");
    }
}