class EXACTOverlayOpacityHandler {

    constructor(viewer,image_info, browser_sync) {
        this.image_info = image_info;
        this.browser_sync = browser_sync;
        this.viewer = viewer;
        this.background_viewer = undefined;

        var t_mat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

        this.updateHomographyUI(t_mat);
        
        $("#OverlayRegImage-enabled").click(this.enableOverlayRegImageSlider.bind(this));
        $('#registration00').change(this.syncViewBackgroundForeground.bind(this));
        $('#registration11').change(this.syncViewBackgroundForeground.bind(this));
    }

    enableOverlayRegImageSlider(event) {

        if ($("#OverlayRegImage-enabled").prop("checked")) {
            const options = {
                id: "openseadragon_background",
                prefixUrl: $("#image_list").data( "static-file" ) +"images/",
                showNavigator: false,
                tileSources: [this.viewer.tileSources[0]
                        .replace(`images/image/${this.image_info.get("target_image_id")}`, 
                        `images/image/${this.image_info.get("source_image_id")}`)],
                showNavigator: false,
                animationTime: 0.5,
                blendTime: 0.1,
                constrainDuringPan: true,
                maxZoomPixelRatio: 8,
                minZoomLevel: 0.1,
                zoomPerScroll: 1.1,
                timeout: 120000,
                sequenceMode: false,
                showReferenceStrip: false,
            };

            this.background_viewer = OpenSeadragon(options);

            this.background_viewer.addHandler("open", function (event) {
                this.userData.calcInitialScaleFactor();
                var opacity = 50;
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
            var t_mat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            t_mat[0][0] = parseFloat($('#registration00').val());
            t_mat[0][1] = parseFloat($('#registration01').val());
            t_mat[0][2] = parseFloat($('#registration02').val());
            
            t_mat[1][0] = parseFloat($('#registration10').val());
            t_mat[1][1] = parseFloat($('#registration11').val());
            t_mat[1][2] = parseFloat($('#registration12').val());
            
            var inv_t_mat = this.inverse([[t_mat[0][0], t_mat[0][1], t_mat[0][2]], [t_mat[1][0], t_mat[1][1], t_mat[1][2]]]);
            
            var inv_mpp_x_scale = inv_t_mat[0][0];
            var inv_mpp_y_scale = inv_t_mat[1][1];

            var bounds = this.viewer.viewport.getBounds(true);
            var imageRect = this.viewer.viewport.viewportToImageRectangle(bounds);
    
            var [xmin_trans, ymin_trans] = this.transformAffineInv(imageRect.x, imageRect.y);

            const vpRect = this.background_viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(
                xmin_trans,
                ymin_trans, 
                imageRect.width * inv_mpp_x_scale,  
                imageRect.height * inv_mpp_y_scale,  
                0
            ));

            this.background_viewer.viewport.fitBoundsWithConstraints(vpRect);
        }
    }

    calcInitialScaleFactor() {
        if (this.background_viewer !== undefined) {
            var t_mat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

            var x1 = this.background_viewer.viewport._contentSize.x;
            var y1 = this.background_viewer.viewport._contentSize.y;

            var x2 = this.viewer.viewport._contentSize.x;
            var y2 = this.viewer.viewport._contentSize.y;

            t_mat[0][0] = (x2/x1).toFixed(5);
            t_mat[1][1] = (y2/y1).toFixed(5);

            this.updateHomographyUI(t_mat);
        }
    }

    transformAffineInv(x, y) {
        var t_mat = [[1, 0, 0], [0, 1, 0]];

        t_mat[0][0] = parseFloat($('#registration00').val());
        t_mat[0][1] = parseFloat($('#registration01').val());
        t_mat[0][2] = parseFloat($('#registration02').val());
        
        t_mat[1][0] = parseFloat($('#registration10').val());
        t_mat[1][1] = parseFloat($('#registration11').val());
        t_mat[1][2] = parseFloat($('#registration12').val());
        
        var inv_t_mat = this.inverse([[t_mat[0][0], t_mat[0][1], t_mat[0][2]], [t_mat[1][0], t_mat[1][1], t_mat[1][2]]]);

        var t_00 = inv_t_mat[0][0];
        var t_10 = inv_t_mat[1][0];

        var t_01 = inv_t_mat[0][1];
        var t_11 = inv_t_mat[1][1];

        var t_02 = inv_t_mat[0][2];
        var t_12 = inv_t_mat[1][2];
        
        var new_x = Math.round(t_00 * x + t_01 * y + t_02);
        var new_y = Math.round(t_10 * x + t_11 * y + t_12);  
        
        return [new_x, new_y];
    }

    updateHomographyUI(matrinx) {
        $('#registration00').val(matrinx[0][0]);
        $('#registration01').val(matrinx[0][1]);
        $('#registration02').val(matrinx[0][2]);
    
        $('#registration10').val(matrinx[1][0]);
        $('#registration11').val(matrinx[1][1]);
        $('#registration12').val(matrinx[1][2]);
    
        $('#registration20').val(matrinx[2][0]);
        $('#registration21').val(matrinx[2][1]);
        $('#registration22').val(matrinx[2][2]);
    }

    inverse(matrix) {
        var a = matrix[0][0], b = matrix[1][0], c = matrix[0][1], d = matrix[1][1], e = matrix[0][2], f = matrix[1][2];
    
        const denom = a * d - b * c;
    
        return [[d / denom, c / -denom, (d * e - c * f) / -denom], [b / -denom, a / denom, (b * e - a * f) / denom]];
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