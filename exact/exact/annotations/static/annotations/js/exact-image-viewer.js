// JS file for handling the openseadragon viewer


function value_formatter(labels, value)
{
    if (labels.length>=value)
    {
        let retval = labels[value] ;
        return retval;
    }
    else
    {
        return value;
    }
}

class EXACTViewer {
    constructor(server_url, options, imageInformation, gHeaders, user_id) {

        this.imageId = imageInformation['id'];
        this.imageInformation = imageInformation;
        this.server_url = server_url;
        this.gHeaders = gHeaders;
        this.user_id = user_id;
        this.options = options;
        this.showNavigator = true;
        this.frame = 1;
    
        this.viewer = this.createViewer(options);
        this.exact_registration_sync = undefined; 
        this.browser_sync = undefined; 

        this.exact_image_sync = new EXACTImageSync(this.imageId, this.gHeaders, this.viewer);
        this.initViewerEventHandler(this.viewer, imageInformation);

        this.registration = null;
        this.filterImage = new OpenseadragonFilteringViewer(this.viewer);
        this.pluginHandler = new PluginHandler(this.imageId, gHeaders, this.viewer);
        this.screeningTool = new ScreeningTool(imageInformation, user_id, gHeaders, this.viewer);

        console.log(`${this.constructor.name} loaded for id ${this.imageId}`);


        this.heatmapInvToggle = false;
        this.heatmapToggle = false;

        $(document).keyup(this.handleKeyUp.bind(this));
    }

    static factoryCreateViewer(server_url, imageId, options, imageInformation, annotationTypes = undefined,
        headers = undefined, user_id = undefined, collaboration_type = 0, drawAnnotations = true, strokeWidth = 5) {

        // extract requested frame parameter
        let frame = 1;
        if (options.url_parameters !== undefined 
            && "frame" in options.url_parameters) {
            frame = parseInt(options.url_parameters["frame"]);
        }

        let set_name = $("#image_list").data( "image_set_name")
        let image_name = imageInformation.name.split('.')[0]
        if (imageInformation['depth'] == 1 && imageInformation['frames'] == 1) {
            // check if the CDN should be used
            if ($("#image_list").data( "static_cdn") === "True") {     
                let dzi_path = $("#image_list").data( "static-file" ) + `wsi_images/${set_name}/${image_name}/1/1/tile.dzi`;
                //let dzi_path = `https://d1bf27ceus4k6n.cloudfront.net/static/wsi_images/${set_name}/${image_name}/1/1/tile.dzi`
                // check if the CDN contains the image
                let xhr = new XMLHttpRequest();
                try {      
                    xhr.onload = () => {
                        if (xhr.status >= 400) {
                            options.tileSources = [server_url + `/images/image/${imageId}/1/1/tile/`];
                        } else {
                            options.crossOriginPolicy = "Anonymous";
                            options.tileSources = [ dzi_path ];
                        }
                    };

                    xhr.open("GET", dzi_path, false);
                    xhr.send();   
                } catch (e) {
                    // use the clasical image retreval approach
                    options.tileSources = [server_url + `/images/image/${imageId}/1/1/tile/`];
                }     
            } else {
                options.tileSources = [server_url + `/images/image/${imageId}/1/1/tile/`]
            }            
        }
        if (imageInformation['depth'] > 1 || imageInformation['frames'] > 1) {
            let tileSources = []
            // first iterrate time points
            for (const frame of Array(imageInformation['frames']).keys()) {
                // for each frame iterrate z dimension
                for (const z of Array(imageInformation['depth']).keys()) {
                    // image_id/z/frame/
                    let path = server_url + `/images/image/${imageId}/${z + 1}/${frame + 1}/tile/`
                    tileSources.push(path);
                }
            }
            options.tileSources = tileSources;
            options.sequenceMode = true;
            if ((imageInformation["FrameDescriptions"].length==0) || ((imageInformation["FrameDescriptions"][0]["frame_type"]>0)))
            {
               options.showReferenceStrip = true;
            }
            options.preserveViewport = true;

            // show referenceStrip at the side 
            if (imageInformation['depth'] > 1) {
                options.referenceStripScroll = 'vertical';
            }
        }

        if (annotationTypes !== undefined && Object.keys(annotationTypes).length > 0) {

            let global_annotation_types = {};
            let local_annotation_types = {};

            // check if there are global an local annotations and instanciate viewer accordingly
            for (let anno_type_id in annotationTypes) {
                let anno_type = annotationTypes[anno_type_id]
                if (anno_type.vector_type === 7) {
                    global_annotation_types[anno_type.id] = anno_type;
                } else {
                    local_annotation_types[anno_type.id] = anno_type;
                }
            }

            // create viewer with global and local support
            if (Object.keys(global_annotation_types).length > 0
                && Object.keys(local_annotation_types).length > 0) {
                if (imageInformation['frames'] > 1) {
                    return new EXACTViewerGlobalLocalAnnotationsFrames(server_url, options, imageInformation, collaboration_type, local_annotation_types, global_annotation_types,
                        headers, user_id, drawAnnotations, strokeWidth, frame)
                } else {
                    return new EXACTViewerGlobalLocalAnnotations(server_url, options, imageInformation, collaboration_type, local_annotation_types, global_annotation_types,
                        headers, user_id, drawAnnotations, strokeWidth)
                }
            } else if (Object.keys(global_annotation_types).length > 0) {
                if (imageInformation['frames'] > 1) {
                    return new EXACTViewerGlobalAnnotationsFrame(server_url, options, imageInformation, collaboration_type, annotationTypes,
                        headers, user_id, frame)
                } else {
                    return new EXACTViewerGlobalAnnotations(server_url, options, imageInformation, collaboration_type, annotationTypes,
                        headers, user_id)
                }
            } else {
                if (imageInformation['frames'] > 1) {
                    return new EXACTViewerLocalAnnotationsFrames(server_url, options, imageInformation, collaboration_type, annotationTypes,
                        headers, user_id, drawAnnotations, strokeWidth, frame);
                } else {
                    return new EXACTViewerLocalAnnotations(server_url, options, imageInformation, collaboration_type, annotationTypes,
                        headers, user_id, drawAnnotations, strokeWidth);
                }
            }
        } else {
            // create viewer without the option to handle annotations
            return new EXACTViewerWithoutAnnotations(server_url, options, imageInformation, headers, user_id, frame);
        }
    }

    createViewer(options) {

        const default_options = {
            id: "openseadragon1",
            prefixUrl: $("#image_list").data( "static-file" ) +"images/",
            showNavigator: true,
            animationTime: 0.5,
            blendTime: 0.1,
            constrainDuringPan: true,
            maxZoomPixelRatio: 8,
            minZoomLevel: 0.1,
            //visibilityRatio: 1,
            zoomPerScroll: 1.1,
            timeout: 120000,
            showFullPageControl: false,
            sequenceMode: false,
            showReferenceStrip: false,
        };

        const viewer_options = Object.assign(default_options, options);

        return OpenSeadragon(viewer_options);
    }


    initBrowserSycEvents() {
        this.browser_sync.getChannelObject("ImageViewPort").onmessage = 
                    this.receiveCurrentViewPortCoordinages.bind(this);


        this.browser_sync.getChannelObject("SendCreatedOrUpdateAnnotation").onmessage = 
                    this.receiveCreatedOrUpdatedAnnotationFromOtherTab.bind(this);

        this.browser_sync.getChannelObject("SendDeletedAnnotation").onmessage = 
                    this.receiveDeletedAnnotationFromOtherTab.bind(this);
    }

    receiveDeletedAnnotationFromOtherTab(event) {

        if ($("#SyncAnnosToView-enabled").prop("checked")) {

            let selectedImageName = $("select#sync_browser_image").val();
            if(event.data.image_name === selectedImageName 
                && this.browser_sync.registration != null
                && event.data.annotation !== undefined
                && event.data.annotation.annotation_type in this.annotationTypes) {

                this.tool.removeAnnotation(event.data.annotation.unique_identifier);
                this.exact_sync.deleteAnnotation(event.data.annotation.unique_identifier);
            }
        }
    }


    receiveCreatedOrUpdatedAnnotationFromOtherTab(event) {

        if ($("#SyncAnnosToView-enabled").prop("checked")) {

            let selectedImageName = $("select#sync_browser_image").val();
            if(event.data.image_name === selectedImageName 
                && this.browser_sync.registration != null
                && event.data.annotation !== undefined
                && event.data.annotation.vector !== null
                && event.data.annotation.vector !== undefined
                && event.data.annotation.annotation_type in this.annotationTypes) {

                let annotation = event.data.annotation;
                annotation.annotation_type = this.annotationTypes[annotation.annotation_type];

                // transform coordinates
                let new_vector = {}
                switch (annotation.annotation_type.vector_type) {
                    case 1: // Rect
                    case 2: // POINT or Elipse
                    case 6: // Rect
                    case 7: // Global
                        // transform center and then with and height
                        let width = annotation.vector.x2 - annotation.vector.x1;
                        let height = annotation.vector.y2 - annotation.vector.y1;

                        let center_x = annotation.vector.x1 + (width / 2); 
                        let center_y = annotation.vector.y1 + (height / 2);

                        [center_x, center_y] = this.browser_sync.registration.transformAffine(center_x, center_y);
                        width *= this.browser_sync.registration.mpp_x_scale;
                        height *= this.browser_sync.registration.mpp_x_scale;

                        new_vector["x1"] = center_x - (width / 2);
                        new_vector["y1"] = center_y - (height / 2);

                        new_vector["x2"] = center_x + (width / 2);
                        new_vector["y2"] = center_y + (height / 2);
                        break;

                    default:
                        // transfer each coordinate paar individually
                        var count = Object.keys(annotation.vector).length / 2;
                        for (var i = 1; i <= count; i++) {
                            [new_vector["x" + i], new_vector["y" + i]] = this.browser_sync.registration.transformAffine(annotation.vector["x" + i], annotation.vector["y" + i]);
                        }    
                        break;
                }

                if (annotation.unique_identifier in this.exact_sync.annotations) { 
                    // if the annotation is known
                    let current_annotation = this.exact_sync.annotations[annotation.unique_identifier];
                    annotation.id = current_annotation.id;
                } else {
                    annotation.id = -1;
                }

                annotation.vector = new_vector;
                annotation.image = this.imageId;

                this.exact_sync.saveAnnotation(annotation);

                let annotations = [annotation];

                if (annotation.id === -1) { // create a new annotation
                    this.viewer.raiseEvent('sync_drawAnnotations', { annotations });
                } else {
                    // update the drawing of an existing annotation
                    this.viewer.raiseEvent('sync_updateDrawnAnnotations', { annotations });
                }
                
            }
        }

    }


    receiveCurrentViewPortCoordinages(event) {

        if (document.visibilityState == 'visible' && 
                $("#SyncBrowserViewpoint-enabled").prop("checked")) {

            let selectedImageName = $("select#sync_browser_image").val();
            if(event.data.image_name === selectedImageName) {

                let x_min = event.data.x_min;
                let y_min = event.data.y_min;
                let width = event.data.x_max - event.data.x_min;
                let height = event.data.y_max - event.data.y_min;
                let rotation_angle = ("rotation_angle" in event.data) ? event.data.angle : 0


                if (this.browser_sync.registration != null) {
                    [x_min, y_min] = this.browser_sync.registration.transformAffine(x_min, y_min);
                    width *= this.browser_sync.registration.mpp_x_scale;
                    height *= this.browser_sync.registration.mpp_x_scale;
                    rotation_angle = -this.browser_sync.registration.rotation_angle;
                }

                this.viewCoordinates(x_min, y_min, width, height, rotation_angle);
            }
        }        
    }

    imageOpend() {
        this.exact_image_sync.imageOpend();
    }

    imageClosed() {
        this.exact_image_sync.imageClosed();
    }

    initViewerEventHandler(viewer, imageInformation) {

        // Update URL
        viewer.addHandler('animation-finish', function (event) {

            let bounds = this.userData.viewer.viewport.getBounds(true);
            let imageRect = this.userData.viewer.viewport.viewportToImageRectangle(bounds);

            let xmin = Math.round(imageRect.x);
            let ymin = Math.round(imageRect.y);
            let xmax = Math.round(imageRect.x + imageRect.width);
            let ymax = Math.round(imageRect.y + imageRect.height);
            let z_dimension = 1;
            

            let frame = this.userData.frameSlider?._state.value[0] ?? 0;

            let coordinates = {
                "x_min": xmin, 
                "y_min": ymin,
                "x_max": xmax,
                "y_max": ymax,
            }
            this.userData.browser_sync.sendCurrentViewPortCoordinates(coordinates);
            
            if (this.userData.browser_sync !== undefined && this.userData.browser_sync.registration != null) {
                this.userData.browser_sync.registration.syncViewBackgroundForeground();
            }

            window.history.pushState("object or string",
                `${this.userData.imageInformation.name}`,
                include_server_subdir(`/annotations/${this.userData.imageInformation.id}/?frame=${frame}&xmin=${xmin}&ymin=${ymin}&xmax=${xmax}&ymax=${ymax}`));

        }, this);

        viewer.addHandler("processing_togglePluginResultVisibility", function (event) {
            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if ((anno.generated == true) && (event.ResultEntries.indexOf(anno.pluginresultentry)>=0)) {
                    this.userData.tool.updateAnnotationVisibility(anno.unique_identifier, event.Checked);
                }
            }
            for (let bitmap of Object.values(this.userData.exact_sync.bitmaps))
            {
                if (event.Checked)
                {
                    $('#overlay-bitmap-'+bitmap.id).css("opacity", "100%")

                }
                else
                {
                    $('#overlay-bitmap-'+bitmap.id).css("opacity", "0%")
                }
            }
        }, this);


        viewer.addHandler("processing_adjustThreshold", function (event) {
            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if ((anno.generated == true) && (event.ResultEntry == anno.pluginresultentry)) {
                    this.userData.tool.updateThresholdedVisibility(anno.unique_identifier, anno.score>=event.Value);
                }
            }
        }, this);       

        viewer.addHandler("processing_changePluginResultAlpha", function (event) {
            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if ((anno.generated == true) && (event.ResultEntries.indexOf(anno.pluginresultentry)>=0)) {
                    this.userData.tool.updateAnnotationAlpha(anno.unique_identifier, event.Value/100);
                }
            }
            for (let bitmap of Object.values(this.userData.exact_sync.bitmaps))
            {
                $('#overlay-bitmap-'+bitmap.id).css("opacity", event.Value+'%')
            }
        }, this);        


        viewer.addHandler("viewCoordinates", function (event) {

            var coordinates = event.coordinates;

            event.userData.browser_sync.sendCurrentViewPortCoordinates(coordinates);
            event.userData.viewCoordinates(coordinates.x_min, coordinates.y_min, coordinates.x_max-coordinates.x_min, coordinates.y_max-coordinates.y_min);

        }, this);

        // called when the image is loaded
        viewer.addHandler("open", function (event) {
            viewer.canvas.tabIndex = 1;
            viewer.canvas.focus();

            event.userData.imageOpend();

            // zoom to last url position
            if (event.userData.options.url_parameters !== undefined &&
                "xmin" in event.userData.options.url_parameters && "ymin" in event.userData.options.url_parameters &&
                "xmax" in event.userData.options.url_parameters && "ymax" in event.userData.options.url_parameters) {

                let coodinates = event.userData.options.url_parameters;

                event.userData.viewCoordinates(parseInt(coodinates.xmin), parseInt(coodinates.ymin), parseInt(coodinates.xmax - coodinates.xmin), parseInt(coodinates.ymax - coodinates.ymin));
            }

            function addNavigatorImage(status, context) {

                if (status === true) {
                    var navigator_overlay = {
                        Image: {
                            xmlns: "http://schemas.microsoft.com/deepzoom/2008",
                            Url: context.server_url + "/images/image/" + context.imageId + "_navigator_overlay/0/0/",
                            Format: "jpeg",
                            Overlap: "2",
                            TileSize: "256",
                            Size: {
                                Width: context.imageInformation['width'],
                                Height: context.imageInformation['height'],
                            }
                        }
                    };

                    var tiledImage = viewer.world.getItemAt(0);
                    viewer.navigator.addTiledImage({
                        tileSource: navigator_overlay,
                        originalTiledImage: tiledImage
                    });
                }
            }

            // Check if navigator overlay exists or is supported and add if returns true
            event.userData.exact_image_sync.navigatorOverlayAvailable(addNavigatorImage, event.userData);


            event.userData.exact_registration_sync = new EXACTRegistrationSync(event.userData.viewer, event.userData.imageInformation, event.userData.gHeaders);
            event.userData.browser_sync = new EXACTBrowserSync(event.userData.imageInformation, event.userData.viewer, event.userData.exact_registration_sync);
            event.userData.initBrowserSycEvents();


            this.searchTool = new SearchTool(event.userData.imageId, event.userData.viewer, event.userData.exact_sync, event.userData.browser_sync);
        }, this);


        this.overlaySlider = new Slider("#overlaySlider", {
            ticks: [0, 25, 50, 75, 100],
            ticks_labels: ['0', '25%', '50% Opacity', '75%', '100%'],
            //tooltip: 'always',
            ticks_snap_bounds: 1,
            value: 100
        });
        this.overlaySlider.on('change', this.updateOverlayRegImageSlider.bind(this));

        viewer.addHandler("updateOverlayImageSlider", function (event) {

            var opacity = event.opacity;
            this.userData.overlaySlider.setValue(opacity);
            this.userData.updateOverlayRegImageSlider(opacity);
        }, this);


        // disable nav if image is to small
        if (imageInformation['width'] < 2500 || imageInformation['height'] < 2500)
            viewer.navigator.element.style.display = "none";
        else {
            viewer.navigator.element.style.display = "inline-block";

            viewer.scalebar({
                xOffset: 10,
                yOffset: 10,
                barThickness: 3,
                color: '#555555',
                fontColor: '#333333',
                backgroundColor: 'rgba(255, 255, 255, 0.5)',
                pixelsPerMeter: 0,
                location: OpenSeadragon.ScalebarLocation.TOP_Center,
            });

            viewer.scalebar({
                pixelsPerMeter: imageInformation['mpp'] > 0.0001 ? (1e6 / imageInformation['mpp']) : 1
            });
        }

        viewer.guides({
            allowRotation: false,        // Make it possible to rotate the guidelines (by double clicking them)
            horizontalGuideButton: null, // Element for horizontal guideline button
            verticalGuideButton: null,   // Element for vertical guideline button
            prefixUrl: $("#image_list").data( "static-file" ) +"images/",
            removeOnClose: true,        // Remove guidelines when viewer closes
            useSessionStorage: false,    // Save guidelines in sessionStorage
            navImages: {
                zoomIn:
                {
                    REST: 'zoom-in.svg',
                    GROUP: 'zoom-in.svg',
                    HOVER: 'zoom-in.svg',
                    DOWN: 'zoom-in.svg',
                },
                guideHorizontal: {
                    REST: 'nothing.png',
                    GROUP: 'nothing.png',
                    HOVER: 'nothing.png',
                    DOWN: 'nothing.png'
                },
                guideVertical: {
                    REST: 'nothing.png',
                    GROUP: 'nothing.png',
                    HOVER: 'nothing.png',
                    DOWN: 'nothing.png'
                }            
            }
        });

        viewer.addHandler('page', function (event) {

            if (this.userData.frameSlider !== undefined &&
                event.page + 1 !== this.userData.frameSlider.getValue()) {

                this.userData.frameSlider.setValue(event.page + 1);
            }
        }, this);

        viewer.activateImagingHelper({ onImageViewChanged: this.onImageViewChanged.bind(this) });

        // add frame slider if frames > 1
        // or add zoome slider if objective power is greater than 1
        let objectivePower = imageInformation['objectivePower'];
        let frames = imageInformation['frames'];
        if (frames > 1) {
            var labels = [];
            for (let i=0;i < imageInformation.FrameDescriptions.length;i++)
            {
                labels.push(imageInformation.FrameDescriptions[i]['description']);
                
            }
            this.frameSlider = new Slider("#frameSlider", {
                ticks_snap_bounds: 1,
                value: 0,
                formatter: function(val){ return value_formatter (labels,val) },
                min: 0,
                tooltip: 'always',
                max: frames-1
            });
            this.frameSlider.on('change', this.onFrameSliderChanged.bind(this));
        }
        if (objectivePower > 1) {

            const default_ticks = [0, 1, 2, 5, 10, 20, 40, 80, 160];
            const default_names = ["0x", "1x", "2x", "5x", "10x", "20x", "40x", "80x", "160x"];

            var ticks_to_use = [];
            var labels_to_use = [];

            for (let i = 0; i < default_ticks.length; i++) {
                if (default_ticks[i] <= objectivePower) {
                    ticks_to_use.push(default_ticks[i]);
                    labels_to_use.push(default_names[i]);
                } else {
                    ticks_to_use.push(default_ticks[i]);
                    labels_to_use.push(default_names[i]);
                    break;
                }
            }

            this.gZoomSlider = new Slider("#zoomSlider", {
                ticks: ticks_to_use,
                scale: 'logarithmic',
                ticks_labels: labels_to_use,
                tooltip: 'always',
                ticks_snap_bounds: 1,
                value: 0
            });
            this.gZoomSlider.on('change', this.onSliderChanged.bind(this));
        }

        let showNavigationButton = new OpenSeadragon.Button({
            tooltip: 'Show navigation overview',
            name: "ShowNavigation",
            srcRest: viewer.prefixUrl + `map_rest.png`,
            srcGroup: viewer.prefixUrl + `map_grouphover.png`,
            srcHover: viewer.prefixUrl + `map_hover.png`,
            srcDown: viewer.prefixUrl + `map_pressed.png`,
            onClick: this.uiShowNavigatorToggle.bind(this),
        });
        viewer.buttons.buttons.push(showNavigationButton);
        viewer.buttons.element.appendChild(showNavigationButton.element);
    }

    handleKeyUp(event) {

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        
        switch (event.keyCode) {
            case 79: //o toggle overlay
                if(this.viewer.world.getItemAt(0).getOpacity() > 0) {
                    this.viewer.world.getItemAt(0).setOpacity(0);
                }else {
                    this.viewer.world.getItemAt(0).setOpacity(parseInt($("#overlaySlider").val()) / 100);
                }
                break;
            }

    }

    handleKeyPress(event) {
        return;
    }

    handleKeyDown(event){
        return
    }

    initUiEvents() {
        return;
    }

    initToolEventHandler(viewer) {
        return;
    }

    createDrawingModule(viewer, imageId, imageInformation) {
        return;
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, user_id) {
        return;
    }

    uiShowNavigatorToggle(event) {
        if (this.showNavigator) {
            this.viewer.scalebarInstance.divElt.style.display = "none";
            this.viewer.navigator.element.style.display = "none";
            this.showNavigator = false;
        } else {
            this.showNavigator = true;
            this.viewer.navigator.element.style.display = "inline-block";
            this.viewer.scalebarInstance.divElt.style.display = "inline-block";
        }
    }

    finishAnnotation() {
        return;
    }

    destroy() {
        if (this.gZoomSlider !== undefined) {
            this.gZoomSlider.destroy();
        }

        if (this.overlaySlider !== undefined) {
            this.overlaySlider.destroy();
        }

        if (this.frameSlider !== undefined) {
            this.frameSlider.destroy();
        }

        this.imageClosed();
        this.viewer.destroy();

        if (this.searchTool !== undefined) {
            this.searchTool.destroy();
        }

        this.screeningTool.destroy();

        if (this.browser_sync !== undefined)
            this.browser_sync.destroy();

        $('#overlaySlider').off("input");
    }

    onFrameSliderChanged(event) {
        if (this.frameSlider !== undefined) {
            this.viewer.goToPage(this.frameSlider.getValue() - 1);
        }
    }

    updateOverlayRegImageSlider(value) {
        if (this.viewer.world.getItemAt(0) !== undefined) {
            this.viewer.world.getItemAt(0).setOpacity(parseInt($("#overlaySlider").val()) / 100);
        }       
    }

    onSliderChanged(event) {

        if (this.viewer.imagingHelper.getZoomFactor().toFixed(3) !==
            (event.newValue / this.imageInformation['objectivePower']).toFixed(3)) {
            this.viewer.imagingHelper.setZoomFactor(event.newValue / this.imageInformation['objectivePower'], true);
        }
    }

    onImageViewChanged(event) {

        if (this.gZoomSlider !== undefined &&
            this.gZoomSlider.getValue().toFixed(3)
            !== (event.zoomFactor * this.imageInformation['objectivePower']).toFixed(3)) {

            this.gZoomSlider.setValue(this.imageInformation['objectivePower'] * event.zoomFactor);
        }
    }

    viewCoordinates(x_min, y_min, width, height, rotation_angle=0) {

        rotation_angle = (rotation_angle !== undefined) ? rotation_angle : 0;

        this.viewer.viewport.setRotation(rotation_angle);

        const vpRect = this.viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(
            x_min,
            y_min,
            width,
            height,
            -rotation_angle
        ));

        this.viewer.viewport.fitBoundsWithConstraints(vpRect);
    }
}

class EXACTViewerWithoutAnnotations extends EXACTViewer {
    constructor(server_url, options, imageInformation, headers, user_id, frame) {

            super(server_url, options, imageInformation, headers, user_id);
    
            this.processingTool = new ProcessingTool(this.viewer, this.imageId);

            this.initToolEventHandler(this.viewer);

            // EXACT sync is necessary for retrieving processing results of 
            this.exact_sync = this.createSyncModules({}, this.imageId, headers, this.viewer, user_id, 0);

            this.frames = imageInformation['frames'];
            this.frame = frame;
    
            if (frame > 1) {
                this.viewer.goToPage(frame - 1);
            }

        }
    initToolEventHandler(viewer) {

        viewer.addHandler('sync_drawOverlays', function (event) {

            // Convert from viewport coordinates to image coordinates.
            if (event.bitmaps.length>0)
            {
                // clear all overlays
                viewer.clearOverlays()
            }

            for (let bitmap of event.bitmaps) {
                if ( (!(bitmap.location_rect.hasOwnProperty('x'))) || (!(bitmap.location_rect.hasOwnProperty('y')))
                    || (!(bitmap.location_rect.hasOwnProperty('width'))) || (!(bitmap.location_rect.hasOwnProperty('height'))) )
                    {
                        $.notify('Malformed location rectangle.', { position: "bottom center", className: "error" });
                        continue;
                    }
                let rect = new OpenSeadragon.Rect(bitmap.location_rect.x, bitmap.location_rect.y, bitmap.location_rect.width, bitmap.location_rect.height)
                var rect_viewport = viewer.viewport.imageToViewportRectangle(rect);

                if (bitmap.channels==3) {
                    // RGB overlay
                    var elt = document.createElement("div");
                    elt.id = "overlay-bitmap-"+bitmap.id;
                    elt.className = "bmpoverlay";

                    var alpha = 100;
                    if ($('#alpha-plugin-'+bitmap.plugin).length>0)
                    {
                        alpha = parseInt($('#alpha-plugin-'+bitmap.plugin)[0].value)
                    }

                    elt.innerHTML = '<img src="'+bitmap.bitmap+'" class="bmpoverlay" style="width=100%;height:100%">'
                    elt.style = "opacity:"+alpha+"%"                    

                    viewer.addOverlay({
                        element: elt,
                        location: rect_viewport
                    }); 
                }
                
            }
            
        }, this);
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, user_id, collaboration_type) {
        return new EXACTAnnotationSync(annotationTypes, imageId, headers, viewer, user_id, collaboration_type)
    }
    
}

class EXACTViewerLocalAnnotations extends EXACTViewer {

    constructor(server_url, options, imageInformation, collaboration_type, annotationTypes,
        headers, user_id, drawAnnotations = true, strokeWidth = 5) {

        super(server_url, options, imageInformation, headers, user_id);

        this.y_button_start = 150;
        this.annotationsToggle = true;

        // set initial annotaton type
        this.annotationTypes = annotationTypes;
        this.current_annotation_type = undefined;
        this.annotationTypeKeyToIdLookUp = {}

        this.tool = this.createDrawingModule(this.viewer, this.imageId, this.imageInformation);
        this.initToolEventHandler(this.viewer);

        this.exact_sync = this.createSyncModules(annotationTypes, this.imageId, headers, this.viewer, user_id, collaboration_type);
        this.searchTool = undefined;

        this.asthmaAnalysis = new AsthmaAnalysis(this.imageId, this.viewer, this.exact_sync);

        this.showAnnotationProperties = new ShowAnnotationProperties(this.viewer, this.exact_sync);

        let team_id = parseInt($('#team_id').html());
        this.teamTool = new TeamTool(this.viewer, team_id);
        this.processingTool = new ProcessingTool(this.viewer, this.imageId);

        this.actionStack = [];
        this.actionMemory = 50;
        this.currentAction = undefined

        this.pressedDigits = {
            1 : false,
            2 : false,
            3 : false,
            4 : false,
            5 : false,
            6 : false,
            7 : false,
            8 : false,
            9 : false
        }

        this.insertNewAnno = false

        this.initUiEvents(this.annotationTypes);
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation);

        viewer.addHandler("team_ChangeCreatorAnnotationsVisibility", function (event) {

            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if ((anno.generated == false) && (anno.user.id === event.User)) {
                    this.userData.tool.updateAnnotationVisibility(anno.unique_identifier, event.Checked);
                }
            }
        }, this);

        viewer.addHandler("team_ChangeLastEditedAnnotationsVisibility", function (event) {

            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if ((anno.generated == false) && (anno.last_editor.id === event.User)) {
                    this.userData.tool.updateAnnotationVisibility(anno.unique_identifier, event.Checked);
                }
            }
        }, this);


        viewer.addHandler("search_ShowAnnotation", function (event) {

            event.userData.tool.showItem(event.annotation);
        }, this);

        viewer.selection({
            allowRotation: false,
            restrictToImage: true,
            showSelectionControl: true
        });

        viewer.addHandler("selection_onScroll", function (event) {
            event.userData.tool.resizeItem(event);
        }, this);

        viewer.addHandler('selection_onDrag', function (event) {
            event.userData.tool.handleMouseDrag(event);
        }, this);


        viewer.addHandler('selection_toggle', function (event) {

            if (event.enabled === false &&
                event.userData.tool.selection !== undefined) {
                
                if ((event.userData.tool.singlePolyOperation.active || event.userData.tool.multiPolyOperation.active ) && event.userData.tool.current_item.type == 'new')
                    event.userData.deleteAnnotation()
                else
                    event.userData.tool.resetSinglePolyOperation()

                event.userData.do_finishAnnotation();

            }

            event.userData.tool.resetMultiPolyOperation()
        }, this);

        viewer.addHandler("selection_cancel", function (event) {
            event.userData.cancelEditAnnotation();
        }, this);

        viewer.addHandler('selection_onPress', function (event) {
            viewer.canvas.focus()
            // setup viewport
            var viewportPoint = viewer.viewport.pointFromPixel(event.position);
            var imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
            // setup objects to use
            var tool = event.userData.tool;
            var exact_sync = event.userData.exact_sync;
            // reset drag handler
            tool.drag.active = false
            tool.drag.performed = false
            tool.drag.segment = undefined
            tool.drag.lastPos = imagePoint
            tool.drag.fixPoint = undefined

            if (tool.isPointInImage(imagePoint)) // mouse press is within image
            {
                // check if objects were clicked
                var new_selected = tool.hitTestObject(imagePoint)
                var selected_segment = tool.hitTestSegment(imagePoint)

                var insertAnno = (this.userData.insertNewAnno || event.originalEvent.ctrlKey)
                var polyOpActive = (event.userData.tool.singlePolyOperation.active || event.userData.tool.multiPolyOperation.active)

                if(selected_segment !== undefined && !insertAnno && !polyOpActive)
                {
                    // a segment to drag is selected, we didnt press ctrl to force a new object, no poly operation is active
                    tool.drag.active = true
                    tool.drag.segment = selected_segment

                    event.userData.currentAction = {
                        type: "Updated",
                        uuid: tool.selection.item.name,
                        old_item: tool.selection.item.clone({insert: false})
                    }
                }
                else if (new_selected == undefined || polyOpActive || insertAnno)
                {
                    // a new object is created
                    if(tool.selection !== undefined) // reset selection, if existing
                    {
                        tool.resetSelection();
                        if (event.userData.tool.singlePolyOperation.active)
                        {
                            event.userData.tool.singlePolyOperation.selected.item.selected = true
                        }
                    }

                    var selected_annotation_type = event.userData.getCurrentAnnotationType();

                    if (event.userData.tool.multiPolyOperation.active) // special case for multi poly operations
                    {
                        selected_annotation_type = Object.create(selected_annotation_type)
                        selected_annotation_type.vector_type = 4
                    }

                    // create new anno
                    var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                    exact_sync.addAnnotationToCache(newAnno)

                    event.userData.currentAction = {
                        type: "Created",
                        uuid: newAnno.unique_identifier
                    }
                }
                else if (tool.selection !== undefined)
                {
                    // the currently selected item might be dragged
                    event.userData.currentAction = {
                        type: "Updated",
                        uuid: tool.selection.item.name,
                        old_item: tool.selection.item.clone({insert: false})
                    }
                    
                }
            }
        }, this);

        viewer.addHandler("selection_onRelease", function (event) {
            viewer.canvas.focus()
            // setup viewport
            var viewportPoint = viewer.viewport.pointFromPixel(event.position);
            var imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
            // setup objects to use
            var tool = event.userData.tool;
            var exact_sync = event.userData.exact_sync;

            var fastAnnotate = (Object.values(event.userData.pressedDigits).filter(Boolean).length == 1)

            if (tool.selection !== undefined && tool.selection.type == "new")
            {
                // a new polygon is currently drawn
                if (event.userData.tool.singlePolyOperation.active)
                {
                    viewer.raiseEvent('boundingboxes_PolyOperation', {name: event.userData.tool.singlePolyOperation.mode});
                    tool.resetSinglePolyOperation();
                }
                else if (event.userData.tool.multiPolyOperation.active)
                {
                    viewer.raiseEvent('boundingboxes_PolyOperation', {name: event.userData.tool.multiPolyOperation.mode});
                    tool.resetMultiPolyOperation();
                    tool.resetSelection()
                }
                else
                {
                    var new_selection = tool.selection

                    var last_uuid = tool.selection.item.name;
                    var anno = exact_sync.annotations[last_uuid];
                    event.userData.do_finishAnnotation(anno);

                    // select the new item, if it was not deleted (because it was to small)
                    //if (exact_sync.annotations[last_uuid] !== undefined)
                    //{
                    //    new_selection.type = "fill"
                    //    var new_selection = tool.handleSelection(event, new_selection);
                    //}
                }
            }
            else 
            {
                // no polygon is currently drawn
                if (tool.isPointInImage(imagePoint))
                {
                    // current mouse release is within the image
                    var new_selected = tool.hitTestObject(imagePoint);

                    if(tool.drag.performed)
                    {
                        // an object or segment was moved
                        var anno = exact_sync.getAnnotation(tool.selection.item.name)
                        anno.vector = tool.getAnnotationVector(tool.selection.item.name)
                        exact_sync.saveAnnotation(anno)

                        event.userData.appendAction([event.userData.currentAction])
                        event.userData.currentAction = undefined

                        tool.drag.performed = false
                    }
                    else if(new_selected !== undefined && !fastAnnotate)
                    {
                        // we select a new object
                        if(tool.selection !== undefined && new_selected.item.name !== tool.selection.item.name)
                        {
                            // save the last object
                            var last_uuid = tool.selection.item.name
                            var anno = exact_sync.annotations[last_uuid];
                            event.userData.finishAnnotation(anno);

                            // TODO consider if we have to save a action here, e.g. for brush mode
                        }

                        // select the new item
                        var new_selection = tool.handleSelection(event, new_selected);

                        if (new_selection !== undefined) {
                            var selected_anno = exact_sync.annotations[new_selection.item.name];

                            if (selected_anno !== undefined) // catch an error that occours when the server is to slow
                            {
                                event.userData.setCurrentAnnotationType(selected_anno.annotation_type);
                            }
                        }
                    }
                    else
                    {
                        // fast annotate mode is active

                        var i = 0
                        // get currently pressed key
                        for(; i<Object.keys(event.userData.pressedDigits).length; i++)
                        {
                            if(Object.values(event.userData.pressedDigits)[i])
                            {
                                break
                            }
                        }
                        i = i+1

                        // assign currently pressed label to smallest clicked object
                        var to_assign = tool.hitTestObject_s(imagePoint)
                        var to_assign_anno = exact_sync.annotations[to_assign.item.name];

                        var annotation_type_id = event.userData.annotationTypeKeyToIdLookUp[i];

                        event.userData.tool.resetSelection()
                        event.userData.changeAnnotationType(annotation_type_id, to_assign_anno)
                    }
                }
            }

        }, this);

        viewer.addHandler('boundingboxes_PolyOperation', function (event) {
            var resultDict = { deleted: [], insert: [], update: [], included: [] }

            let tool = event.userData.tool;
            let exact_sync = event.userData.exact_sync;
            var current_Action = []

            switch (event.name) {
                case "NOT":
                    resultDict = tool.polyNotOperation();
                    break;
                case "UNION":
                    resultDict = tool.polyUnionOperation();
                    break;
                case "SCISSOR":
                    resultDict = tool.polyScissorOperation();
                    break;
                case "GLUE":
                    resultDict = tool.polyGlueOperation();
                    break;
                case "KNIFE":
                    resultDict = tool.polyKnifeOperation();
                    break;

                case "HARMONIZE":
                    resultDict = tool.findIncludedObjectsOperation();
                default:
                    break;
            }

            for (let el of resultDict.update) 
            {
                var unique_identifier = el[0]

                let annotation = exact_sync.getAnnotation(unique_identifier)
                annotation.vector = event.userData.getAnnotationVector(annotation.unique_identifier);
                exact_sync.saveAnnotation(annotation)

                var action = {
                    type: "Updated",
                    uuid: unique_identifier,
                    old_item: el[1]
                }
                current_Action.push(action)
            }

            for (let el of resultDict.deleted) 
            {
                var unique_identifier = el[0]

                let item = tool.getItemFromUUID(unique_identifier)
                item.remove()
                let annotation = exact_sync.getAnnotation(unique_identifier);
                exact_sync.deleteAnnotation(unique_identifier)

                if(el[1])
                {
                    var action = {
                        type: "Deleted",
                        uuid: unique_identifier,
                        del_item: item,
                        del_anno: annotation
                    }
                    current_Action.push(action)
                }
            }

            for (let newAnno of resultDict.insert) 
            {
                if (Number.isInteger(newAnno.annotation_type)) {
                    newAnno.annotation_type = exact_sync.annotationTypes[newAnno.annotation_type]
                }
                exact_sync.addAnnotationToCache(newAnno)
                exact_sync.saveAnnotation(newAnno)

                var action ={
                    type: "Created",
                    uuid: newAnno.unique_identifier
                }
                current_Action.push(action)
            }

            for (let unique_identifier of new Set(resultDict.included)) 
            {

                var annotation = exact_sync.getAnnotation(unique_identifier);
                var newType = event.userData.getCurrentAnnotationType();
                var oldType = annotation.annotation_type

                if (newType !== undefined) {

                    if (annotation.annotation_type.id !== newType.id) {
                        // check if annotation type can be converted and save
                        if (tool.checkIfAnnotationTypeChangeIsValid(annotation.annotation_type.vector_type,
                            newType.vector_type)) 
                        {
                            annotation.annotation_type = newType;
                            tool.updateAnnotationType(annotation.unique_identifier, newType, false);

                            annotation.vector = event.userData.getAnnotationVector(annotation.unique_identifier);
                            exact_sync.saveAnnotation(annotation)

                            var action = {
                                type: "Label Changed",
                                uuid: unique_identifier,
                                old_type: oldType
                            }
                            current_Action.push(action)
                        }
                    }
                }
            }

            event.userData.appendAction(current_Action)

        }, this)
    }

    onImageViewChanged(event) {
        super.onImageViewChanged(event);

        this.tool.updateStrokeWidth(null);
    }

    handleKeyUp(event) {

        super.handleKeyUp(event);

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {

            case 8: //'DEL'
                this.do_deleteAnnotation();
                break;
            case 88: //'X'
                this.do_deleteAnnotation();
                break;
            case 120: //'X'
                this.do_deleteAnnotation();
                break;

            case 13: //'enter'
                if(!this.tool.singlePolyOperation.active && !this.tool.multiPolyOperation.active)
                    this.do_finishAnnotation();
                break;
            case 27: // Escape
                this.cancelEditAnnotation();
                break;
            case 46: //'DEL'
                this.do_deleteAnnotation();
                break;

            case 49: //1
            case 97: //1
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(1);
                }
                this.pressedDigits[1] = false
                break;
            case 50: //2
            case 98: //2
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(2);
                }
                this.pressedDigits[2] = false
                break;
            case 51: //3
            case 99: //3
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(3);
                }
                this.pressedDigits[3] = false
                break;
            case 52: //4
            case 100: //4
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(4);
                }
                this.pressedDigits[4] = false
                break;
            case 53: //5
            case 101: //5
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(5);
                }
                this.pressedDigits[5] = false
                break;
            case 54: //6
            case 102: //6
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(6);
                }
                this.pressedDigits[6] = false
                break;
            case 55: //7
            case 103: //7
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(7);
                }
                this.pressedDigits[7] = false
                break;
            case 56: //8
            case 104: //8
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(8);
                }
                this.pressedDigits[8] = false
                break;
            case 57: //9
            case 105: //9
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(9);
                }
                this.pressedDigits[9] = false
                break;
            case 65: //a
                this.insertNewAnno = false;
                break;

            case 66: //b
                this.pushCurrentAnnoTypeToBackground();
                break;
            case 67: //c
                this.viewer.selectionInstance.toggleState();
                break;
            case 82: //r
                if(!this.tool.singlePolyOperation.active && !this.tool.multiPolyOperation.active)
                    this.do_finishAnnotation();
                break;
            case 86: //'v'
                if(!this.tool.singlePolyOperation.active && !this.tool.multiPolyOperation.active)
                    this.do_finishAnnotation();
                break;
            case 89: // 'y'
                this.uiShowAnnotationsToggle();
                break;
            case 83: // 's'
                this.tool.activateSinglePolyOperationByString("SCISSOR", this);
                break;
            case 71: // 'g'
                this.tool.activateSinglePolyOperationByString("GLUE", this);
                break;
            case 68: //d
                this.tool.activateMultiPolyOperationByString("KNIFE", this);
                break;
            case 90: // z
                if(event.ctrlKey){
                    this.undo();
                }
            case 91: // '?'
                this.uiShowHeatmapToggle();
                break;
        }
    }

    handleKeyPress(event)
    {
        switch (event.keyCode) {
            case 97: //a
                this.insertNewAnno = true;
                break;
        }

        // handle digit key press
        if (event.keyCode >=49 && event.keyCode <=57)
        {
            this.pressedDigits[event.key] = true
        }
    }
    
    handleKeyDown(event)
    {
        if(this.viewer.selectionInstance.isSelecting)
        {
            this.viewer.innerTracker.keyDownHandler(event)
        }
    }

    initToolEventHandler(viewer) {

        viewer.addHandler('sync_drawOverlays', function (event) {

            // Convert from viewport coordinates to image coordinates.
            if (event.bitmaps.length>0)
            {
                // clear all overlays
                viewer.clearOverlays()
            }

            for (let bitmap of event.bitmaps) {
                if ( (!(bitmap.location_rect.hasOwnProperty('x'))) || (!(bitmap.location_rect.hasOwnProperty('y')))
                    || (!(bitmap.location_rect.hasOwnProperty('width'))) || (!(bitmap.location_rect.hasOwnProperty('height'))) )
                    {
                        $.notify('Malformed location rectangle.', { position: "bottom center", className: "error" });
                        continue;
                    }
                let rect = new OpenSeadragon.Rect(bitmap.location_rect.x, bitmap.location_rect.y, bitmap.location_rect.width, bitmap.location_rect.height)
                var rect_viewport = viewer.viewport.imageToViewportRectangle(rect);

                if (bitmap.channels==3) {
                    // RGB overlay
                    var elt = document.createElement("div");
                    elt.id = "overlay-bitmap-"+bitmap.id;
                    elt.className = "bmpoverlay";

                    var alpha = 100;
                    if ($('#alpha-plugin-'+bitmap.plugin).length>0)
                    {
                      alpha = parseInt($('#alpha-plugin-'+bitmap.plugin)[0].value)
                    }

                    elt.innerHTML = '<img src="'+bitmap.bitmap+'" class="bmpoverlay" style="width=100%;height:100%">'
                    elt.style = "opacity:"+alpha+"%"                    

                    viewer.addOverlay({
                        element: elt,
                        location: rect_viewport
                    }); 
                }
                
            }
            
        }, this);

        viewer.addHandler('sync_drawAnnotations', function (event) {
            event.userData.tool.drawExistingAnnotations(event.annotations, event.userData.drawAnnotations);
        }, this);

        viewer.addHandler('sync_updateDrawnAnnotations', function (event) {
            event.userData.tool.updateAnnotations(event.annotations);
        }, this);

        viewer.addHandler('sync_drawHeatmap', function (event) {

            //console.log('addHandler-annotations.length=', event.annotations.length)
            //event.userData.tool.drawHeatmap(event.annotations, event.userData.drawHeatmap);

        }, this);
    }

    initUiEvents(annotation_types) {


        //$(document).keyup(this.handleKeyUp.bind(this));
        $(document).keypress(this.handleKeyPress.bind(this));
        $(document).keydown(this.handleKeyDown.bind(this));
        $('select#annotation_type_id').change(this.changeAnnotationTypeByComboxbox.bind(this));

        // tool events
        $('#StrokeWidthSlider').on("input", this.updateStrokeWidth.bind(this));
        $('#OpacitySlider').on("input", this.updateOpacity.bind(this));

        for (let annotation_type of Object.values(annotation_types)) {

            $('#DrawCheckBox_' + annotation_type.id).change(this.uiLocalAnnotationVisibilityChanged.bind(this));
            $('#annotation_type_id_button_' + annotation_type.id).click(this.uiAnnotationTypeChanged.bind(this));

            let key_number = $('#annotation_type_' + annotation_type.id).data('annotation_type_key');
            this.annotationTypeKeyToIdLookUp[key_number] = annotation_type.id;
        }

        let element = new OpenSeadragon.Button({
            tooltip: 'Draw annotations (y)',
            name: "DrawAnnotations",
            srcRest: this.viewer.prefixUrl + `anno_rest.png`,
            srcGroup: this.viewer.prefixUrl + `anno_grouphover.png`,
            srcHover: this.viewer.prefixUrl + `anno_hover.png`,
            srcDown: this.viewer.prefixUrl + `anno_pressed.png`,
            onClick: this.uiShowAnnotationsToggle.bind(this),
        });
        this.viewer.buttons.buttons.push(element);
        this.viewer.buttons.element.appendChild(element.element);


        let element_heatmap = new OpenSeadragon.Button({
            tooltip: 'Draw Heatmap',
            name: "DrawHeatmap",
            srcRest: this.viewer.prefixUrl + `heatmap_rest.png`,
            srcGroup: this.viewer.prefixUrl + `heatmap_grouphover.png`,
            srcHover: this.viewer.prefixUrl + `heatmap_hover.png`,
            srcDown: this.viewer.prefixUrl + `heatmap_pressed.png`,
            onClick: this.uiShowHeatmapToggle.bind(this),
        });
        this.viewer.buttons.buttons.push(element_heatmap);
        this.viewer.buttons.element.appendChild(element_heatmap.element);

        let element_heatmap_inv = new OpenSeadragon.Button({
            tooltip: 'Draw Heatmap Inv',
            name: "DrawHeatmapInv",
            srcRest: this.viewer.prefixUrl + `heatmap_inv_rest.png`,
            srcGroup: this.viewer.prefixUrl + `heatmap_inv_grouphover.png`,
            srcHover: this.viewer.prefixUrl + `heatmap_inv_hover.png`,
            srcDown: this.viewer.prefixUrl + `heatmap_inv_pressed.png`,
            onClick: this.uiShowHeatmapInvToggle.bind(this),
        });
        this.viewer.buttons.buttons.push(element_heatmap_inv);
        this.viewer.buttons.element.appendChild(element_heatmap_inv.element);

        // Register Annotation Buttons
        this.annotationButtons = [
            new OpenSeadragon.Button({
                tooltip: 'Save (v)',
                name: "save_button",
                srcRest: this.viewer.prefixUrl + `save_rest.png`,
                srcGroup: this.viewer.prefixUrl + `save_grouphover.png`,
                srcHover: this.viewer.prefixUrl + `save_hover.png`,
                srcDown: this.viewer.prefixUrl + `save_pressed.png`,
                onClick: this.do_finishAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Undo (Ctrl + Z)',
                name: "undo_button",
                srcRest: this.viewer.prefixUrl + `undo_rest.png`,
                srcGroup: this.viewer.prefixUrl + `undo_grouphover.png`,
                srcHover: this.viewer.prefixUrl + `undo_hover.png`,
                srcDown: this.viewer.prefixUrl + `undo_pressed.png`,
                onClick: this.undo.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Verify',
                name: "verify_annotation_button",
                srcRest: this.viewer.prefixUrl + `check_rest.png`,
                srcGroup: this.viewer.prefixUrl + `check_grouphover.png`,
                srcHover: this.viewer.prefixUrl + `check_hover.png`,
                srcDown: this.viewer.prefixUrl + `check_pressed.png`,
                onClick: this.verifyAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Delete (DEL, x)',
                name: "delete_annotation_button",
                srcRest: this.viewer.prefixUrl + `trash_rest.png`,
                srcGroup: this.viewer.prefixUrl + `trash_grouphover.png`,
                srcHover: this.viewer.prefixUrl + `trash_hover.png`,
                srcDown: this.viewer.prefixUrl + `trash_pressed.png`,
                onClick: this.do_deleteAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Substract the slected objects area from all other objects ',
                name: "NOT",
                srcRest: this.viewer.prefixUrl + `subtract_rest.png`,
                srcGroup: this.viewer.prefixUrl + `subtract_rest.png`,
                srcHover: this.viewer.prefixUrl + `subtract_hover.png`,
                srcDown: this.viewer.prefixUrl + `subtract_pressed.png`,
                onClick: this.tool.clickPolyOperation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Merge all polygon objects from the same class touching the selected object',
                name: "UNION",
                srcRest: this.viewer.prefixUrl + `union_rest.png`,
                srcGroup: this.viewer.prefixUrl + `union_rest.png`,
                srcHover: this.viewer.prefixUrl + `union_hover.png`,
                srcDown: this.viewer.prefixUrl + `union_pressed.png`,
                onClick: this.tool.clickPolyOperation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Changes the class of all included objects to selected class if possible',
                name: "HARMONIZE",
                srcRest: this.viewer.prefixUrl + `basket_rest.png`,
                srcGroup: this.viewer.prefixUrl + `basket_rest.png`,
                srcHover: this.viewer.prefixUrl + `basket_hover.png`,
                srcDown: this.viewer.prefixUrl + `basket_pressed.png`,
                onClick: this.tool.clickPolyOperation.bind(this),
            })
        ]

        this.operatorButtons = {}
        this.operatorButtons["SCISSOR"] = new OpenSeadragon.Button({tooltip: 'Draw a polygon to cut from the currently selected one (s)',
                                                        name: "SCISSOR",
                                                        srcRest: this.viewer.prefixUrl + `scissors_rest.png`,
                                                        srcGroup: this.viewer.prefixUrl + `scissors_rest.png`,
                                                        srcHover: this.viewer.prefixUrl + `scissors_hover.png`,
                                                        srcDown: this.viewer.prefixUrl + `scissors_pressed.png`,
                                                        onClick: this.tool.activateSinglePolyOperation.bind(this),
                                                        })

        this.operatorButtons["GLUE"] = new OpenSeadragon.Button({   tooltip: 'Draw a polygon to gulue it to the currently selected one (g)',
                                                        name: "GLUE",
                                                        srcRest: this.viewer.prefixUrl + `glue_rest.png`,
                                                        srcGroup: this.viewer.prefixUrl + `glue_rest.png`,
                                                        srcHover: this.viewer.prefixUrl + `glue_hover.png`,
                                                        srcDown: this.viewer.prefixUrl + `glue_pressed.png`,
                                                        onClick: this.tool.activateSinglePolyOperation.bind(this),
                                                        })

        this.operatorButtons["KNIFE"] = new OpenSeadragon.Button({   tooltip: 'Draw a line to cut through polygons (d)',
                                                        name: "KNIFE",
                                                        srcRest: this.viewer.prefixUrl + `knife_rest.png`,
                                                        srcGroup: this.viewer.prefixUrl + `knife_rest.png`,
                                                        srcHover: this.viewer.prefixUrl + `knife_hover.png`,
                                                        srcDown: this.viewer.prefixUrl + `knife_pressed.png`,
                                                        onClick: this.tool.activateMultiPolyOperation.bind(this),
                                                        })

        this.operatorActiveImgs = {}

        this.operatorActiveImgs["SCISSOR"] = this.operatorButtons["SCISSOR"].imgDown.cloneNode(true)
        this.operatorButtons["SCISSOR"].element.appendChild(this.operatorActiveImgs["SCISSOR"])

        this.operatorActiveImgs["GLUE"] = this.operatorButtons["GLUE"].imgDown.cloneNode(true)
        this.operatorButtons["GLUE"].element.appendChild(this.operatorActiveImgs["GLUE"])

        this.operatorActiveImgs["KNIFE"] = this.operatorButtons["KNIFE"].imgDown.cloneNode(true)
        this.operatorButtons["KNIFE"].element.appendChild(this.operatorActiveImgs["KNIFE"])

        this.annotationButtons.push(this.operatorButtons["SCISSOR"])
        this.annotationButtons.push(this.operatorButtons["GLUE"])
        this.annotationButtons.push(this.operatorButtons["KNIFE"])

        this.annotationButtons.forEach(element => {
            this.viewer.addControl(element.element, { anchor: OpenSeadragon.ControlAnchor.ABSOLUTE, top: this.y_button_start, left: 5 });
            this.y_button_start += 45;
        });
    }

    /**
     * Handle toggle of the draw annotations checkbox.
     *
     * @param event
     */
    uiShowAnnotationsToggle() {

        this.annotationsToggle = !this.annotationsToggle;

        this.annotationVisibility(this.annotationsToggle);
    }

    uiShowHeatmapToggle() {

        this.heatmapToggle = !this.heatmapToggle;
        this.heatmapVisibility(this.heatmapToggle);
    }

    uiShowHeatmapInvToggle() {

        this.heatmapInvToggle = !this.heatmapInvToggle;
        this.heatmapVisibility(this.heatmapInvToggle, true);
    }

    changeAnnotationTypeByComboxbox() {
        let annotation_type_id = $('#annotation_type_id').children(':selected').val();

        this.changeAnnotationType(annotation_type_id);
    }

    changeAnnotationTypeByKey(annotationKeyNumber) {

        if (annotationKeyNumber in this.annotationTypeKeyToIdLookUp) {
            let annotation_type_id = this.annotationTypeKeyToIdLookUp[annotationKeyNumber];
            this.changeAnnotationType(annotation_type_id);
        }
    }

    uiAnnotationTypeChanged(event) {
        var annotation_type_id = parseInt(event.target.dataset.annotation_type_id);
        this.changeAnnotationType(annotation_type_id);
    }

    uiLocalAnnotationVisibilityChanged(event) {
        var annotation_type_id = parseInt(event.target.dataset.annotation_type_id);
        var tristate_option = $("#tristate_option")[0].value

        var visible = true
        var disabled_hitTest = false
        var keep_interaction = false

        if(event.currentTarget.value == "on")
        {
            event.currentTarget.checked = false
            event.currentTarget.value="off"
            visible = false
        }
        else if(event.currentTarget.value == "off" && (tristate_option == "no_interact"))
        {
            event.currentTarget.indeterminate = true
            event.currentTarget.checked = true
            event.currentTarget.value="indeterminate"
            visible = true
            disabled_hitTest = true
        }
        else if(event.currentTarget.value == "off" && (tristate_option == "no_vis"))
        {
            event.currentTarget.indeterminate = true
            event.currentTarget.checked = true
            event.currentTarget.value="indeterminate"
            visible = false
            keep_interaction = true
        }
        else
        {
            event.currentTarget.indeterminate = false
            event.currentTarget.checked = true
            event.currentTarget.value="on"
            visible = true
        }

        if (this.heatmapToggle === true) {
            this.heatmapVisibility();
        }
            
        
        if (this.heatmapInvToggle === true) {
            this.heatmapVisibility(true, true);
        }
            
        
        this.changeAnnotationTypeVisibility(annotation_type_id, visible, disabled_hitTest, keep_interaction);
    }

    pushCurrentAnnoTypeToBackground()
    {
        var selected_annotation_type = this.getCurrentAnnotationType();
        this.tool.pushAnnoTypeToBackground(selected_annotation_type.id)
    }

    createDrawingModule(viewer, imageId, imageInformation) {
        return new BoundingBoxes(viewer, imageId, imageInformation);
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, user_id, collaboration_type) {
        return new EXACTAnnotationSync(annotationTypes, imageId, headers, viewer, user_id, collaboration_type)
    }

    getCurrentAnnotationType() {
        let annotation_type_id = $('#annotation_type_id').children(':selected').val();
        return this.annotationTypes[annotation_type_id];
    }

    setCurrentAnnotationType(annotation_type) {
        $('#annotation_type_id').val(annotation_type.id);
        this.current_annotation_type = annotation_type;
    }

    getCurrentSelectedAnnotation() {
        let annotation = undefined;

        if (this.tool.selection !== undefined) {
            let uuid = this.tool.selection.item.name;
            annotation = this.exact_sync.getAnnotation(uuid);
        }

        return annotation;
    }

    cancelEditAnnotation() {
        if (this.tool.selection !== undefined) {
            let annotation = this.getCurrentSelectedAnnotation();

            // delete temp annotation
            if (annotation.id === -1) {
                let uuid = annotation.unique_identifier
                this.tool.removeAnnotation(uuid);
                this.exact_sync.deleteAnnotation(uuid);
                
                if(this.tool.singlePolyOperation.selected !== undefined)
                {
                    this.tool.selection = this.tool.singlePolyOperation.selected;
                }
            } 
            else { // just cancel editing
                if (!(this.tool.singlePolyOperation.active || this.tool.multiPolyOperation.active))
                {
                    this.tool.resetSelection()
                }
            }
        } else {
            // Todo: Handle annoation editing buttons like save, valid etc.
        }

        this.tool.resetSinglePolyOperation()
        this.tool.resetMultiPolyOperation()
    }

    annotationVisibility(drawAnnotations = true) {

        for (const annotation_type_id in this.annotationTypes) {
            this.tool.updateVisbility(annotation_type_id, drawAnnotations);
        }
    }

    heatmapVisibility(drawHeatmap= true, inv= false) {

        if (drawHeatmap) {
            let annos  = $.map(this.exact_sync.annotations, function(value, key) { return value });

            // filter anno types that are not supported like poly or line.
            annos = annos.filter(anno => [1, 6, 2].includes(anno.annotation_type.vector_type))

            // filter annos according to type visibility
            Object.keys(this.exact_sync.annotationTypes).forEach(annotation_type_id => {
                var checkbox = $('#DrawCheckBox_' + annotation_type_id)[0]
                if (!checkbox.checked) {
                    annos = annos.filter(anno => anno.annotation_type.id !== parseInt(annotation_type_id));
                }
            });

            this.tool.drawHeatmap(annos, inv);
        } else {            
            this.tool.drawHeatmap([], inv);
        }
    }

    changeAnnotationTypeVisibility(annotation_type_id, visibility, disabled_hitTest, keep_interaction) {
        this.tool.updateVisbility(annotation_type_id, visibility, disabled_hitTest, keep_interaction);
    }

    verifyAnnotation(annotation) {
        // if annotation is undefined or an event use current selected one
        if (typeof annotation === "undefined" ||
            annotation.hasOwnProperty('originalEvent')) {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined") {
            this.exact_sync.verifyAnnotation(annotation);
        }
    }

    getAnnotationVector(unique_identifier) {
        return this.tool.getAnnotationVector(unique_identifier);
    }

    finishAnnotation(annotation) {

        // if annotation is undefined or an event use current selected one
        if (typeof annotation === "undefined" ||
            annotation.hasOwnProperty('originalEvent')) {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined") {
            
            annotation.vector = this.getAnnotationVector(annotation.unique_identifier);
            if (annotation.annotation_type.vector_type == 5 && annotation.vector.x3 == undefined)
            {
                // dont create polygons with less then 3 points
                this.deleteAnnotation(annotation)
            }
            else
            {
                this.exact_sync.saveAnnotation(annotation)
            }

            this.tool.resetSelection();
        }
    }

    do_finishAnnotation(annotation){
        // if annotation is undefined or an event use current selected one
        if (typeof annotation === "undefined" ||
            annotation.hasOwnProperty('originalEvent')) {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined") {
            
            annotation.vector = this.getAnnotationVector(annotation.unique_identifier);
            if (annotation.annotation_type.vector_type == 5 && annotation.vector.x3 == undefined)
            {
                // dont create polygons with less then 3 points
                this.deleteAnnotation(annotation)
            }
            else
            {
                this.exact_sync.saveAnnotation(annotation)

                if(this.currentAction !== undefined && (this.tool.drag.performed || this.tool.selection.type == 'new'))
                {
                    this.appendAction([this.currentAction])
                    this.currentAction = undefined
                }
            }

            this.tool.resetSelection();
        }
    }

    deleteAnnotation(annotation) {
        // if annotation is undefined use current selected one
        if (typeof annotation === "undefined" || annotation.hasOwnProperty('originalEvent')) 
        {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined" && this.tool.singlePolyOperation.selected !== this.tool.current_item) {
            this.tool.removeAnnotation(annotation.unique_identifier);
            this.exact_sync.deleteAnnotation(annotation.unique_identifier);
        }

        if(this.tool.singlePolyOperation.selected !== undefined)
        {
            this.tool.selection = this.tool.singlePolyOperation.selected;
            this.tool.resetSinglePolyOperation();
        }
        if(this.tool.multiPolyOperation.active)
        {
            this.tool.resetMultiPolyOperation();
        }
    }

    do_deleteAnnotation(annotation) {
        // if annotation is undefined use current selected one
        if (typeof annotation === "undefined" || annotation.hasOwnProperty('originalEvent')) 
        {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined" && this.tool.singlePolyOperation.selected !== this.tool.current_item) {
            var uuid = annotation.unique_identifier

            var action = {
                type: "Deleted",
                uuid: uuid,
                del_item: this.tool.getItemFromUUID(uuid).clone({insert: false}),
                del_anno: annotation
            }
            this.appendAction([action])

            this.tool.removeAnnotation(annotation.unique_identifier);
            this.exact_sync.deleteAnnotation(annotation.unique_identifier);
        }

        if(this.tool.singlePolyOperation.selected !== undefined)
        {
            this.tool.selection = this.tool.singlePolyOperation.selected;
            this.tool.resetSinglePolyOperation();
        }
        if(this.tool.multiPolyOperation.active)
        {
            this.tool.resetMultiPolyOperation();
        }
    }

    changeAnnotationType(new_annoation_type_id, annotation) {

        // if annotation is undefined use current selected one
        if (typeof annotation === "undefined") {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined") {
            // check if annotation type needs to be changed
            if (new_annoation_type_id !== -1 &&
                new_annoation_type_id !== annotation.annotation_type.id) {

                let newType = this.annotationTypes[new_annoation_type_id]
                // check if annotation type can be converted and save
                if (this.tool.checkIfAnnotationTypeChangeIsValid(
                    annotation.annotation_type.vector_type, newType.vector_type)) 
                {
                    var action = {
                        type: "Label Changed",
                        uuid: annotation.unique_identifier,
                        old_type: annotation.annotation_type
                    }
                    this.appendAction([action])

                    annotation.annotation_type = newType;
                    this.tool.resetSelection();
                    this.tool.updateAnnotationType(annotation.unique_identifier, newType, false);
                    this.exact_sync.saveAnnotation(annotation);

                    this.setCurrentAnnotationType(newType);
                } 
                else 
                {
                    $("#annotation_type_id").notify("Conversion to this type is not allowed.",
                        { position: "right", className: "error" });
                }
            }
        } 
        else 
        {
            let annotation_type = this.annotationTypes[new_annoation_type_id];
            this.setCurrentAnnotationType(annotation_type);
        }
    }

    updateStrokeWidth(event) {
        var value
        if (event.hasOwnProperty('originalEvent')) {
            value = event.target.valueAsNumber
        }

        this.tool.updateStrokeWidth(value);
    }

    updateOpacity(event){
        var value
        if (event.hasOwnProperty('originalEvent')) {
            value = event.target.valueAsNumber
        }

        this.tool.updateOpacity(value);
    }

    appendAction(action)
    {
        if(action.length > 0)
        {
            if(this.actionStack.length >= this.actionMemory)
            {
                var remove = this.actionStack.shift()
            }
            this.actionStack.push(action)
        }
    }

    undo()
    {
        if(this.actionStack.length > 0)
        {
            var action_list = this.actionStack.pop()

            action_list.forEach(action => {
                if(action.type == "Created")
                {
                    this.tool.removeAnnotation(action.uuid)
                    this.exact_sync.deleteAnnotation(action.uuid)
                }
                else if(action.type == "Deleted")
                {
                    action.del_item.selected = false
                    action.del_item.name = action.uuid
                    this.tool.group.addChild(action.del_item)
                    action.del_anno.deleted = false
                    this.exact_sync.saveAnnotation(action.del_anno)
                }
                else if(action.type == "Updated")
                {
                    this.tool.removeAnnotation(action.uuid)
                    action.old_item.selected = false
                    action.old_item.name = action.uuid
                    this.tool.group.addChild(action.old_item)

                    var anno = this.exact_sync.getAnnotation(action.uuid)
                    anno.vector = this.getAnnotationVector(action.uuid)
                    this.exact_sync.saveAnnotation(anno)
                }
                else if(action.type == "Label Changed")
                {
                    this.tool.updateAnnotationType(action.uuid, action.old_type, false)

                    var anno = this.exact_sync.getAnnotation(action.uuid)
                    anno.annotation_type = action.old_type
                    this.exact_sync.saveAnnotation(anno)
                }
            })

            this.tool.resetSinglePolyOperation()
            this.tool.resetMultiPolyOperation()
            this.tool.resetSelection()
        }
    }

    destroy() {

        // unregister UI events
        $(document).off("keyup");
        $('select#annotation_type_id').off("change");
        $('#StrokeWidthSlider').off("input");
        $('#OpacitySlider').off("input");
        for (let annotation_type of Object.values(this.annotationTypes)) {

            $('#DrawCheckBox_' + annotation_type.id).off("change");
            $('#annotation_type_id_button_' + annotation_type.id).off("click");
        }

        super.destroy();

        this.tool.clear();
        this.teamTool.destroy();
        this.processingTool.destroy();
        this.exact_sync.destroy();
        this.asthmaAnalysis.destroy();
    }
}

class EXACTViewerLocalAnnotationsFrames extends EXACTViewerLocalAnnotations {

    constructor(server_url, options, imageInformation, collaboration_type, annotationTypes,
        headers, user_id, drawAnnotations = true, strokeWidth = 5, frame = 1) {

        super(server_url, options, imageInformation, collaboration_type, annotationTypes, headers, user_id);
        this.frames = imageInformation['frames'];
        this.frame = frame;

        if (frame > 1) {
            this.viewer.goToPage(frame - 1);
        }
    }

    handleKeyUp(event) {

        super.handleKeyUp(event);

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {
            case 69: //e load next frame
                if (event.shiftKey && this.frame < this.frames) {
                    this.viewer.goToPage(this.frame);
                }
                break;
            case 81: //q load last frame
                if (event.shiftKey && this.frame > 0) {
                    this.viewer.goToPage(this.frame - 2);
                }
                break;
        }
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation);

        viewer.addHandler('page', function (event) {

            event.userData.newPageLoaded(event.page + 1)
        }, this);
    }

    initToolEventHandler(viewer) {

        viewer.addHandler('sync_drawAnnotations', function (event) {

            let annotations = event.userData.filterFrameAnnotations(event.annotations);

            event.userData.tool.drawExistingAnnotations(annotations);
        }, this);

        viewer.addHandler('sync_updateDrawnAnnotations', function (event) {

            let annotations = event.userData.filterFrameAnnotations(event.annotations);

            event.userData.tool.updateAnnotations(annotations);
        }, this);
    }

    initUiEvents(annotation_types) {

        super.initUiEvents(annotation_types);

        // add load annoations from prev frame
        let loadPrevAnnotaionsButton = new OpenSeadragon.Button({
            tooltip: 'Copy all annotations from the previous frame',
            name: "CopyFrameAnnotations",
            srcRest: this.viewer.prefixUrl + `reply_all.svg`,
            srcGroup: this.viewer.prefixUrl + `reply_all.svg`,
            srcHover: this.viewer.prefixUrl + `reply_all.svg`,
            srcDown: this.viewer.prefixUrl + `reply_all.svg`,
            onClick: this.copyAnnotationsFromFrame.bind(this),
        })

        this.annotationButtons.push(loadPrevAnnotaionsButton);
        this.viewer.addControl(loadPrevAnnotaionsButton.element, { anchor: OpenSeadragon.ControlAnchor.ABSOLUTE, top: this.y_button_start, left: 5 });
        this.y_button_start += 45;
    }

    copyAnnotationsFromFrame(event) {

        let prevFrame = this.frame - 1;
        if (prevFrame >= 1) {

            let preFrameAnnotations = this.filterFrameAnnotations(this.exact_sync.annotations, prevFrame);

            // generate new uuids and ids
            let frameAnnotations = preFrameAnnotations.map(anno => {
                return {
                    annotation_type: anno.annotation_type,
                    id: -1,
                    vector: anno.vector,
                    user: { id: null, username: "you" },
                    last_editor: { id: null, username: "you" },
                    image: anno.image,
                    unique_identifier: this.tool.uuidv4(),
                    deleted: false
                }
            });

            this.tool.drawExistingAnnotations(frameAnnotations);

            for (let annotation of frameAnnotations) {
                this.finishAnnotation(annotation)
            }
        }
    }

    newPageLoaded(frame_id) {

        this.frame = frame_id;

        // init new tool
        if (this.tool !== undefined) {
            this.tool.clear();
        }

        this.tool = this.createDrawingModule(this.viewer, this.imageId, this.imageInformation);

        let frameAnnotations = this.filterFrameAnnotations(this.exact_sync.annotations, this.frame);

        this.tool.drawExistingAnnotations(frameAnnotations);

        var parameters = `frame=${this.frame}`;
        if (window.location.search) {
            let url_parameters = decodeURIComponent(window.location.search.substring(1)).split('&');
            url_parameters = Object.assign({}, ...url_parameters.map((x) => ({ [x.split("=")[0]]: x.split("=")[1] })));

            for(const [key, value] of Object.entries(url_parameters)) {
                if (key !== "frame") { 
                    parameters = parameters.concat(`&${key}=${value}`);
                }
                
            }
        }
        window.history.pushState("object or string",
                `${this.imageInformation.name}`,
                include_server_subdir(`/annotations/${this.imageInformation.id}/?${parameters}`));
    }

    filterFrameAnnotations(annotations, frame_id) {

        if (frame_id === undefined) {
            frame_id = this.frame;
        }

        return Object.values(annotations).filter(function (item) {
            return ((item.vector.frame === frame_id) || (item.annotation_type.multi_frame)) && item.deleted === false
        });
    }

    getAnnotationVector(unique_identifier) {
        let vector = this.tool.getAnnotationVector(unique_identifier);
        vector.frame = this.frame;
        return vector;
    }
}


class EXACTViewerGlobalAnnotationsFrame extends EXACTViewer {

    constructor(server_url, options, imageInformation, collaboration_type, annotationTypes,
        headers, user_id, frame) {

        super(server_url, options, imageInformation, headers, user_id);

        this.globalAnnotationTypeKeyToIdLookUp = {}
        this.frames = imageInformation['frames']
        this.frame = frame;

        this.exact_sync = this.createSyncModules(annotationTypes, this.imageId, headers, this.viewer, user_id, collaboration_type, frames = imageInformation['frames']);

        // register for global annotation type interactions
        // set global annotation initialy to false
        for (let annotation_type of Object.values(annotationTypes)) {
            this.setUiGlobalAnnotation(annotation_type, false);
            $('#GlobalAnnotation_' + annotation_type.id).change(this.uiGlobalAnnotationChanged.bind(this));

            let key_number = parseInt($('#GlobalAnnotation_' + annotation_type.id).attr("data-key_number"))
            this.globalAnnotationTypeKeyToIdLookUp[key_number] = annotation_type.id;
        }

        //$(document).keyup(this.handleKeyUp.bind(this));

        if (frame > 1) {
            this.viewer.goToPage(frame - 1);
        }
    }

    handleKeyUp(event) {

        super.handleKeyUp(event);

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {
            case 69: //e load next frame
                if (event.shiftKey && this.frame < this.frames) {
                    this.viewer.goToPage(this.frame);
                }
                break;
            case 81: //q load last frame
                if (event.shiftKey && this.frame > 0) {
                    this.viewer.goToPage(this.frame - 2);
                }
                break;

            case 49: //1
            case 97: //1
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(1);
                }
                break;
            case 50: //2
            case 98: //2
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(2);
                }
                break;
            case 51: //3
            case 99: //3
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(3);
                }
                break;
            case 52: //4
            case 100: //4
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(4);
                }
                break;
            case 53: //5
            case 101: //5
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(5);
                }
                break;
            case 54: //6
            case 102: //6
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(6);
                }
                break;
            case 55: //7
            case 103: //7
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(7);
                }
                break;
            case 56: //8
            case 104: //8
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(8);
                }
                break;
            case 57: //9
            case 105: //9
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(9);
                }
                break;
        }
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation);

        viewer.addHandler('sync_GlobalAnnotations', function (event) {
            if (event.annotation.vector.frame == event.userData.frame) {
                event.userData.setUiGlobalAnnotation(event.annotation.annotation_type, !event.annotation.deleted);
            }
        }, this);

        viewer.addHandler('page', function (event) {

            event.userData.newPageLoaded(event.page + 1);
        }, this);
    }

    newPageLoaded(frame_id) {

        this.frame = frame_id;

        // set global annotations to false
        for (let annotation_type of Object.values(this.exact_sync.annotationTypes)) {
            $('#GlobalAnnotation_' + annotation_type.id).prop("checked", false);
        }

        for (let anno of Object.values(this.exact_sync.annotations[frame_id])) {
            this.setUiGlobalAnnotation(anno.annotation_type, !anno.deleted)
        }

        var parameters = `frame=${this.frame}`;
        if (window.location.search) {
            let url_parameters = decodeURIComponent(window.location.search.substring(1)).split('&');
            url_parameters = Object.assign({}, ...url_parameters.map((x) => ({ [x.split("=")[0]]: x.split("=")[1] })));

            for(const [key, value] of Object.entries(url_parameters)) {
                if (key !== "frame") { 
                    parameters = parameters.concat(`&${key}=${value}`);
                }
                
            }
        }
        window.history.pushState("object or string",
                `${this.imageInformation.name}`,
                include_server_subdir(`/annotations/${this.imageInformation.id}/?${parameters}`));
    }

    changeGlobalAnnotationTypeByKey(annotationKeyNumber) {

        if (annotationKeyNumber in this.globalAnnotationTypeKeyToIdLookUp) {
            let annotation_type_id = this.globalAnnotationTypeKeyToIdLookUp[annotationKeyNumber];

            // invert current global annotation
            let active = !$("#GlobalAnnotation_" + annotation_type_id).prop("checked");
            $("#GlobalAnnotation_" + annotation_type_id).prop("checked", active);

            // Update annotation server side
            this.exact_sync.changeGlobalAnnotation(annotation_type_id, active, this.frame);
        }
    }

    uiGlobalAnnotationChanged(event) {
        let active = $("#" + event.target.id).prop("checked");
        let annotation_type_id = parseInt(event.target.dataset.annotation_type_id);

        this.exact_sync.changeGlobalAnnotation(annotation_type_id, active, this.frame);
    }

    setUiGlobalAnnotation(annotation_type, value) {
        $("#GlobalAnnotation_" + annotation_type.id).prop("checked", value);
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, user_id, collaboration_type, frames) {
        return new EXACTGlobalFrameAnnotationSync(annotationTypes, imageId, headers, viewer, user_id, collaboration_type, frames)
    }

    destroy() {

        // unregister UI events
        for (let annotation_type of Object.values(this.exact_sync.annotationTypes)) {
            $('#GlobalAnnotation_' + annotation_type.id).off("change");
        }

        super.destroy();
        this.exact_sync.destroy();
    }
}

class EXACTViewerGlobalAnnotations extends EXACTViewer {

    constructor(server_url, options, imageInformation, collaboration_type, annotationTypes,
        headers, user_id) {

        super(server_url, options, imageInformation, headers, user_id);
        this.exact_sync = this.createSyncModules(annotationTypes, this.imageId, headers, this.viewer, user_id, collaboration_type);

        this.globalAnnotationTypeKeyToIdLookUp = {}

        // register for global annotation type interactions
        // set global annotation initialy to false
        for (let annotation_type of Object.values(annotationTypes)) {
            this.setUiGlobalAnnotation(annotation_type, false);
            $('#GlobalAnnotation_' + annotation_type.id).change(this.uiGlobalAnnotationChanged.bind(this));

            let key_number = parseInt($('#GlobalAnnotation_' + annotation_type.id).attr("data-key_number"))
            this.globalAnnotationTypeKeyToIdLookUp[key_number] = annotation_type.id;
        }

        //$(document).keyup(this.handleKeyUp.bind(this));
    }

    handleKeyUp(event) {

        super.handleKeyUp(event);

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {

            case 49: //1
            case 97: //1
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(1);
                }
                break;
            case 50: //2
            case 98: //2
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(2);
                }
                break;
            case 51: //3
            case 99: //3
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(3);
                }
                break;
            case 52: //4
            case 100: //4
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(4);
                }
                break;
            case 53: //5
            case 101: //5
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(5);
                }
                break;
            case 54: //6
            case 102: //6
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(6);
                }
                break;
            case 55: //7
            case 103: //7
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(7);
                }
                break;
            case 56: //8
            case 104: //8
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(8);
                }
                break;
            case 57: //9
            case 105: //9
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(9);
                }
                break;
        }
    }

    changeGlobalAnnotationTypeByKey(annotationKeyNumber) {

        if (annotationKeyNumber in this.globalAnnotationTypeKeyToIdLookUp) {
            let annotation_type_id = this.globalAnnotationTypeKeyToIdLookUp[annotationKeyNumber];

            // invert current global annotation
            let active = !$("#GlobalAnnotation_" + annotation_type_id).prop("checked");
            $("#GlobalAnnotation_" + annotation_type_id).prop("checked", active);

            // Update annotation server side
            this.exact_sync.changeGlobalAnnotation(annotation_type_id, active);
        }
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation);

        viewer.addHandler('sync_GlobalAnnotations', function (event) {
            event.userData.setUiGlobalAnnotation(event.annotation.annotation_type, !event.annotation.deleted);
        }, this);

    }

    uiGlobalAnnotationChanged(event) {
        let active = $("#" + event.target.id).prop("checked");
        let annotation_type_id = parseInt(event.target.dataset.annotation_type_id);

        this.exact_sync.changeGlobalAnnotation(annotation_type_id, active);
    }

    setUiGlobalAnnotation(annotation_type, value) {
        $("#GlobalAnnotation_" + annotation_type.id).prop("checked", value);
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, user_id, collaboration_type) {
        return new EXACTGlobalAnnotationSync(annotationTypes, imageId, headers, viewer, user_id, collaboration_type)
    }

    destroy() {

        // unregister UI events
        for (let annotation_type of Object.values(this.exact_sync.annotationTypes)) {
            $('#GlobalAnnotation_' + annotation_type.id).off("change");
        }

        super.destroy();
        this.exact_sync.destroy();
    }
}

class EXACTViewerGlobalLocalAnnotations extends EXACTViewerLocalAnnotations {

    constructor(server_url, options, imageInformation, collaboration_type, annotationTypesLocal, annotationTypesGlobal,
        headers, user_id, drawAnnotations = true, strokeWidth = 5) {

        super(server_url, options, imageInformation, collaboration_type, annotationTypesLocal, headers,
            user_id, drawAnnotations, strokeWidth);

        this.exact_sync_global = new EXACTGlobalAnnotationSync(annotationTypesGlobal,
            this.imageId, headers, this.viewer, user_id, collaboration_type)

        // register for global annotation type interactions
        // set global annotation initialy to false
        this.globalAnnotationTypeKeyToIdLookUp = {};
        for (let annotation_type of Object.values(annotationTypesGlobal)) {
            this.setUiGlobalAnnotation(annotation_type, false);
            $('#GlobalAnnotation_' + annotation_type.id).change(this.uiGlobalAnnotationChanged.bind(this));

            let key_number = parseInt($('#GlobalAnnotation_' + annotation_type.id).attr("data-key_number"))
            this.globalAnnotationTypeKeyToIdLookUp[key_number] = annotation_type.id;
        }

        this.initGlobalEventHandler(this.viewer);
    }

    changeGlobalAnnotationTypeByKey(annotationKeyNumber) {

        if (annotationKeyNumber in this.globalAnnotationTypeKeyToIdLookUp) {
            let annotation_type_id = this.globalAnnotationTypeKeyToIdLookUp[annotationKeyNumber];

            // invert current global annotation
            let active = !$("#GlobalAnnotation_" + annotation_type_id).prop("checked");
            $("#GlobalAnnotation_" + annotation_type_id).prop("checked", active);

            // Update annotation server side
            this.exact_sync_global.changeGlobalAnnotation(annotation_type_id, active);
        }
    }

    handleKeyUp(event) {

        super.handleKeyUp(event);

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {

            case 49: //1
            case 97: //1
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(1);
                }
                break;
            case 50: //2
            case 98: //2
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(2);
                }
                break;
            case 51: //3
            case 99: //3
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(3);
                }
                break;
            case 52: //4
            case 100: //4
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(4);
                }
                break;
            case 53: //5
            case 101: //5
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(5);
                }
                break;
            case 54: //6
            case 102: //6
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(6);
                }
                break;
            case 55: //7
            case 103: //7
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(7);
                }
                break;
            case 56: //8
            case 104: //8
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(8);
                }
                break;
            case 57: //9
            case 105: //9
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(9);
                }
                break;
        }
    }

    initGlobalEventHandler(viewer) {
        viewer.addHandler('sync_GlobalAnnotations', function (event) {
            event.userData.setUiGlobalAnnotation(event.annotation.annotation_type, !event.annotation.deleted);
        }, this);
    }

    uiGlobalAnnotationChanged(event) {
        let active = $("#" + event.target.id).prop("checked");
        let annotation_type_id = parseInt(event.target.dataset.annotation_type_id);

        this.exact_sync_global.changeGlobalAnnotation(annotation_type_id, active);
    }

    setUiGlobalAnnotation(annotation_type, value) {
        $("#GlobalAnnotation_" + annotation_type.id).prop("checked", value);
    }

    destroy() {
        // unregister UI events
        for (let annotation_type of Object.values(this.exact_sync_global.annotationTypes)) {
            $('#GlobalAnnotation_' + annotation_type.id).off("change");
        }

        super.destroy();

        this.exact_sync_global.destroy();
    }
}


class EXACTViewerGlobalLocalAnnotationsFrames extends EXACTViewerLocalAnnotationsFrames {

    constructor(server_url, options, imageInformation, collaboration_type, annotationTypesLocal, annotationTypesGlobal,
        headers, user_id, drawAnnotations = true, strokeWidth = 5, frame = 1) {

        super(server_url, options, imageInformation, collaboration_type, annotationTypesLocal, headers,
            user_id, drawAnnotations);

        this.globalAnnotationTypeKeyToIdLookUp = {}
        this.frames = imageInformation['frames']
        this.frame = frame;

        this.exact_sync_global = new EXACTGlobalFrameAnnotationSync(annotationTypesGlobal, this.imageId, this.gHeaders, this.viewer, this.user_id, collaboration_type, this.frames)

        // register for global annotation type interactions
        // set global annotation initialy to false
        for (let annotation_type of Object.values(annotationTypesGlobal)) {
            this.setUiGlobalAnnotation(annotation_type, false)
            $('#GlobalAnnotation_' + annotation_type.id).change(this.uiGlobalAnnotationChanged.bind(this))

            let key_number = parseInt($('#GlobalAnnotation_' + annotation_type.id).attr("data-key_number"))
            this.globalAnnotationTypeKeyToIdLookUp[key_number] = annotation_type.id;
        }

        if (frame > 1) {
            this.viewer.goToPage(frame - 1);
        }
    }

    handleKeyUp(event) {

        super.handleKeyUp(event);

        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {
            case 49: //1
            case 97: //1
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(1);
                }
                break;
            case 50: //2
            case 98: //2
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(2);
                }
                break;
            case 51: //3
            case 99: //3
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(3);
                }
                break;
            case 52: //4
            case 100: //4
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(4);
                }
                break;
            case 53: //5
            case 101: //5
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(5);
                }
                break;
            case 54: //6
            case 102: //6
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(6);
                }
                break;
            case 55: //7
            case 103: //7
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(7);
                }
                break;
            case 56: //8
            case 104: //8
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(8);
                }
                break;
            case 57: //9
            case 105: //9
                if (event.shiftKey) {
                    this.changeGlobalAnnotationTypeByKey(9);
                }
                break;
        }
    }

    changeGlobalAnnotationTypeByKey(annotationKeyNumber) {

        if (annotationKeyNumber in this.globalAnnotationTypeKeyToIdLookUp) {
            let annotation_type_id = this.globalAnnotationTypeKeyToIdLookUp[annotationKeyNumber];

            // invert current global annotation
            let active = !$("#GlobalAnnotation_" + annotation_type_id).prop("checked");
            $("#GlobalAnnotation_" + annotation_type_id).prop("checked", active);

            // Update annotation server side
            this.exact_sync_global.changeGlobalAnnotation(annotation_type_id, active, this.frame);
        }
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation);

        viewer.addHandler('sync_GlobalAnnotations', function (event) {
            if (event.annotation.vector.frame == event.userData.frame) {
                event.userData.setUiGlobalAnnotation(event.annotation.annotation_type, !event.annotation.deleted);
            }
        }, this);
    }

    newPageLoaded(frame_id) {

        super.newPageLoaded(frame_id);

        // set global annotations to false
        for (let annotation_type of Object.values(this.exact_sync_global.annotationTypes)) {
            $('#GlobalAnnotation_' + annotation_type.id).prop("checked", false);
        }

        for (let anno of Object.values(this.exact_sync_global.annotations[frame_id])) {
            this.setUiGlobalAnnotation(anno.annotation_type, !anno.deleted)
        }
    }

    uiGlobalAnnotationChanged(event) {
        let active = $("#" + event.target.id).prop("checked");
        let annotation_type_id = parseInt(event.target.dataset.annotation_type_id);

        this.exact_sync_global.changeGlobalAnnotation(annotation_type_id, active, this.frame);
    }

    setUiGlobalAnnotation(annotation_type, value) {
        $("#GlobalAnnotation_" + annotation_type.id).prop("checked", value);
    }

    destroy() {
        // unregister UI events
        for (let annotation_type of Object.values(this.exact_sync_global.annotationTypes)) {
            $('#GlobalAnnotation_' + annotation_type.id).off("change");
        }

        super.destroy();

        this.exact_sync_global.destroy();
    }
}
