class EXACTRegistrationHandler {

    constructor(viewer, registration_pair, browser_sync, ) {

        this.registration_pair = registration_pair;
        this.browser_sync = browser_sync;
        this.viewer = viewer;
        this.background_viewer = undefined;
        this.show_registration = ("image_set" in registration_pair.source_image) ? registration_pair.source_image.image_set.show_registration : false;

        // Check if the OpenCv js is loaded
        this.check_opencv = undefined;
        this.check_opencv = setInterval(this.initUiEvents.bind(this), 1000);
    }



    initBrowserSycEvents() {
        this.browser_sync.getChannelObject("ReceiveRegistrationImage").onmessage = 
                    this.receiveRegistrationImage.bind(this);

        this.browser_sync.getChannelObject("SendRegistrationImage").onmessage = 
                    this.sendRegistrationImage.bind(this);
    }

    initUiEvents() {

        if (this.homography !== undefined) {
            clearInterval(this.check_opencv);
        }        

        // Check if the OpenCv js is loaded
        if (typeof cv === "object" && typeof cv.Mat === "function") {

            let matrix = this.registration_pair.transformation_matrix;
            let inv_matrix = this.registration_pair.inv_matrix;

            this.homography = cv.matFromArray(3, 3, cv.CV_64FC1, 
                [matrix.t_00, matrix.t_01, matrix.t_02, 
                    matrix.t_10, matrix.t_11, matrix.t_12,
                    matrix.t_20, matrix.t_21, matrix.t_22]);

            this.inv_homography = cv.matFromArray(3, 3, cv.CV_64FC1, 
                [inv_matrix.t_00, inv_matrix.t_01, inv_matrix.t_02, 
                    inv_matrix.t_10, inv_matrix.t_11, inv_matrix.t_12,
                    inv_matrix.t_20, inv_matrix.t_21, inv_matrix.t_22]);

            this.rotation_angle = this.registration_pair.rotation_angle;
            [this.mpp_x_scale, this.mpp_y_scale] = this.registration_pair.get_scale;
            [this.inv_mpp_x_scale, this.inv_mpp_y_scale] = this.registration_pair.get_inv_scale;

            this.initBrowserSycEvents();
            this.updateHomographyUI();

            // Load current registration 
            if  (this.show_registration && $("#OverlayRegImage-enabled").prop("checked") == false) {
                $("#OverlayRegImage-enabled").prop("checked", true);

                this.enableOverlayRegImageSlider();
            }
        
            $('#update_browser_sync_images_btn').click(this.updateRegistrationJS.bind(this));        
            $("#OverlayRegImage-enabled").click(this.enableOverlayRegImageSlider.bind(this));
        }
    }


    enableOverlayRegImageSlider(event) {

        if ($("#OverlayRegImage-enabled").prop("checked")) {


            const options = {
                id: "openseadragon_background",
                prefixUrl: $("#image_list").data( "static-file" ) +"images/",
                showNavigator: false,
                tileSources: [this.viewer.tileSources[0]
                        .replace(`images/image/${this.registration_pair.target_image.id}`, 
                        `images/image/${this.registration_pair.source_image.id}`)],
                showNavigator: false,
                animationTime: 0.5,
                blendTime: 0.1,
                constrainDuringPan: true,
                maxZoomPixelRatio: 8,
                minZoomLevel: 0.1,
                //visibilityRatio: 1,
                zoomPerScroll: 1.1,
                timeout: 120000,
                sequenceMode: false,
                showReferenceStrip: false,
                //debugMode: true,
            };
    
            this.background_viewer =  OpenSeadragon(options);
            

            this.background_viewer.addHandler("open", function (event) {

                let opacity = 50;
                this.userData.viewer.raiseEvent('updateOverlayImageSlider', { opacity });
                this.userData.syncViewBackgroundForeground();
            }, this);          

        } else {
            if (this.background_viewer !== undefined) {
                this.background_viewer.destroy();

                this.background_viewer = undefined;
            }       
        }

    }

    syncViewBackgroundForeground () {

        if (this.background_viewer !== undefined) {

            let bounds = this.viewer.viewport.getBounds(true);
            let imageRect = this.viewer.viewport.viewportToImageRectangle(bounds);
    
            let [xmin_trans, ymin_trans] = this.transformAffineInv(imageRect.x, imageRect.y);
    
            this.background_viewer.viewport.setRotation(this.rotation_angle);

            const vpRect = this.background_viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(
                xmin_trans,
                ymin_trans, 
                imageRect.width * this.inv_mpp_x_scale,  
                imageRect.height * this.inv_mpp_y_scale,  
                -this.rotation_angle
            ));

            this.background_viewer.viewport.fitBoundsWithConstraints(vpRect);
        }
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

    transformAffineInv(x, y) {

        let t_00 = this.inv_homography.doubleAt(0,0);
        let t_10 = this.inv_homography.doubleAt(1,0);

        let t_01 = this.inv_homography.doubleAt(0,1);
        let t_11 = this.inv_homography.doubleAt(1,1);

        let t_02 = this.inv_homography.doubleAt(0,2);
        let t_12 = this.inv_homography.doubleAt(1,2);
        
        var new_x = Math.round(t_00 * x + t_01 * y + t_02);
        var new_y = Math.round(t_10 * x + t_11 * y + t_12);  
        
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


        if (this.background_viewer !== undefined) {
            this.background_viewer.destroy();

            $("#OverlayRegImage-enabled").prop("checked", false )
        }        

        $('#overlaySlider').off("input");

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
        $("#OverlayRegImage-enabled").off("click");
        $(document).off('keyup');
    }
}