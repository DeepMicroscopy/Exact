// JS file for handling the openseadragon viewer

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
        this.exact_registration_sync = new EXACTRegistrationSync(this.imageInformation, this.gHeaders);

        this.browser_sync = new EXACTBrowserSync(this.imageInformation, this.viewer, this.exact_registration_sync)

        this.exact_image_sync = new EXACTImageSync(this.imageId, this.gHeaders, this.viewer);

        this.initViewerEventHandler(this.viewer, imageInformation);
        this.initBrowserSycEvents();

        this.registration = null;
        this.filterImage = new OpenseadragonFilteringViewer(this.viewer);
        this.pluginHandler = new PluginHandler(this.imageId, gHeaders, this.viewer);
        this.screeningTool = new ScreeningTool(imageInformation, user_id, gHeaders, this.viewer);

        console.log(`${this.constructor.name} loaded for id ${this.imageId}`);
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
            options.showReferenceStrip = true;
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
            return new EXACTViewer(server_url, options, imageInformation, headers, user_id);
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
            sequenceMode: false,
            showReferenceStrip: false,
            //debugMode: true,
        };

        const viewer_options = Object.assign(default_options, options);

        return OpenSeadragon(viewer_options);
    }


    initBrowserSycEvents() {
        this.browser_sync.getChannelObject("ImageViewPort").onmessage = 
                    this.reseiveCurrentViewPortCoordinages.bind(this);
    }

    reseiveCurrentViewPortCoordinages(event) {

        if (document.visibilityState == 'visible' && 
                $("#SyncBrowserViewpoint-enabled").prop("checked")) {

            let selectedImageName = $("select#sync_browser_image").val();
            if(event.data.image_name === selectedImageName) {

                let x_min = event.data.x_min;
                let y_min = event.data.y_min;
                let x_max = event.data.x_max;
                let y_max = event.data.y_max;


                if (this.browser_sync.registration != null) {
                    [x_min, y_min] = this.browser_sync.registration.transformAffine(x_min, y_min);
                    [x_max, y_max] = this.browser_sync.registration.transformAffine(x_max, y_max);

                }

                this.viewCoordinates(x_min, y_min, x_max, y_max);
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
            let frame = this.userData.frame;

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

        viewer.addHandler("viewCoordinates", function (event) {

            var coordinates = event.coordinates;

            event.userData.browser_sync.sendCurrentViewPortCoordinates(coordinates);
            event.userData.viewCoordinates(coordinates.x_min, coordinates.y_min, coordinates.x_max, coordinates.y_max);

        }, this);

        // called when the image is loaded
        viewer.addHandler("open", function (event) {
            viewer.canvas.tabIndex = 1;

            event.userData.imageOpend();

            // zoom to last url position
            if (event.userData.options.url_parameters !== undefined &&
                "xmin" in event.userData.options.url_parameters && "ymin" in event.userData.options.url_parameters &&
                "xmax" in event.userData.options.url_parameters && "ymax" in event.userData.options.url_parameters) {

                let coodinates = event.userData.options.url_parameters;

                event.userData.viewCoordinates(parseInt(coodinates.xmin), parseInt(coodinates.ymin), parseInt(coodinates.xmax), parseInt(coodinates.ymax));
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
            this.frameSlider = new Slider("#frameSlider", {
                ticks_snap_bounds: 1,
                value: 1,
                min: 1,
                tooltip: 'always',
                max: frames
            });
            this.frameSlider.on('change', this.onFrameSliderChanged.bind(this));
        }
        else if (objectivePower > 1) {

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
            srcRest: viewer.prefixUrl + `map.svg`,
            srcGroup: viewer.prefixUrl + `map.svg`,
            srcHover: viewer.prefixUrl + `map.svg`,
            srcDown: viewer.prefixUrl + `map.svg`,
            onClick: this.uiShowNavigatorToggle.bind(this),
        });
        viewer.buttons.buttons.push(showNavigationButton);
        viewer.buttons.element.appendChild(showNavigationButton.element);
    }

    handleKeyUp(event) {
        return;
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

        if (this.frameSlider !== undefined) {
            this.frameSlider.destroy();
        }

        this.imageClosed();
        this.viewer.destroy();
        this.screeningTool.destroy();
        this.browser_sync.destroy();
    }

    onFrameSliderChanged(event) {
        if (this.frameSlider !== undefined) {
            this.viewer.goToPage(this.frameSlider.getValue() - 1);
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

    viewCoordinates(x_min, y_min, x_max, y_max) {

        const vpRect = this.viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(
            x_min,
            y_min,
            x_max - x_min,
            y_max - y_min
        ));

        this.viewer.viewport.fitBoundsWithConstraints(new OpenSeadragon.Rect(
            vpRect.x,
            vpRect.y,
            vpRect.width,
            vpRect.height
        ));
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
        this.searchTool = new SearchTool(this.imageId, this.viewer, this.exact_sync, this.browser_sync);

        this.asthmaAnalysis = new AsthmaAnalysis(this.imageId, this.viewer, this.exact_sync);

        this.showAnnotationProperties = new ShowAnnotationProperties(this.viewer, this.exact_sync);

        let team_id = parseInt($('#team_id').html());
        this.teamTool = new TeamTool(this.viewer, team_id)

        this.initUiEvents(this.annotationTypes);
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation);

        viewer.addHandler("team_ChangeCreatorAnnotationsVisibility", function (event) {

            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if (anno.user.id === event.User) {
                    this.userData.tool.updateAnnotationVisibility(anno.unique_identifier, event.Checked);
                }
            }
        }, this);

        viewer.addHandler("team_ChangeLastEditedAnnotationsVisibility", function (event) {

            for (let anno of Object.values(this.userData.exact_sync.annotations)) {
                if (anno.last_editor.id === event.User) {
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

                event.userData.finishAnnotation();
            }
        }, this);

        viewer.addHandler("selection_cancel", function (data) {
            event.userData.cancelEditAnnotation();
        }, this);

        viewer.addHandler('selection_onPress', function (event) {
            viewer.canvas.focus();

            // Convert pixel to viewport coordinates
            var viewportPoint = viewer.viewport.pointFromPixel(event.position);

            // Convert from viewport coordinates to image coordinates.
            var imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

            // check if the point is inside the image
            let tool = event.userData.tool;
            if (tool.isPointInImage(imagePoint)) {
                let exact_sync = event.userData.exact_sync;

                var unique_identifier = tool.hitTest(imagePoint);

                // check if annotation was hit
                if (unique_identifier !== undefined) {
                    // if the user jumps from one annotation to the next
                    // cancel and save fist annotation
                    if (tool.selection !== undefined &&
                        unique_identifier !== tool.selection.item.name) {

                        let last_uuid = tool.selection.item.name
                        let anno = exact_sync.annotations[last_uuid];
                        event.userData.finishAnnotation(anno);
                    }

                    let new_selected_uuid = tool.handleMousePress(event);

                    if (new_selected_uuid !== undefined) {
                        let selected_anno = exact_sync.annotations[new_selected_uuid];
                        event.userData.setCurrentAnnotationType(selected_anno.annotation_type);
                    }
                } else {

                    let selected_annotation_type = event.userData.getCurrentAnnotationType();

                    if (selected_annotation_type === undefined) {
                        $("#annotation_type_id").notify("You have to choose a type for the annotation.",
                            { position: "right", className: "error" });

                        return;
                    }

                    if (tool.selection === undefined) {
                        // create new anno
                        var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                        exact_sync.addAnnotationToCache(newAnno)

                    } else if (tool.selection !== undefined &&
                        unique_identifier === undefined) {

                        let last_uuid = tool.selection.item.name;
                        let anno = exact_sync.annotations[last_uuid];
                        event.userData.finishAnnotation(anno);

                        // create new anno
                        var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                        exact_sync.addAnnotationToCache(newAnno);
                    }
                }
            }
        }, this);

        viewer.addHandler('boundingboxes_PolyOperation', function (event) {
            var resultDict = { deleted: [], insert: [], update: [], included: [] }

            let tool = event.userData.tool;
            let exact_sync = event.userData.exact_sync;

            switch (event.name) {
                case "NOT":
                    resultDict = tool.polyNotOperation();
                    break;
                case "UNION":
                    resultDict = tool.polyUnionOperation();
                    break;

                case "HARMONIZE":
                    resultDict = tool.findIncludedObjectsOperation();
                default:
                    break;
            }

            for (let unique_identifier of new Set(resultDict.update)) {

                let annotation = exact_sync.getAnnotation(unique_identifier)
                annotation.vector = event.userData.getAnnotationVector(annotation.unique_identifier);
                exact_sync.saveAnnotation(annotation)
            }

            for (let unique_identifier of new Set(resultDict.deleted)) {

                let annotation = exact_sync.getAnnotation(unique_identifier);
                event.userData.deleteAnnotation(annotation);
            }

            for (let newAnno of resultDict.insert) {
                newAnno.vector = event.userData.getAnnotationVector(newAnno.unique_identifier);
                if (Number.isInteger(newAnno.annotation_type)) {
                    newAnno.annotation_type = exact_sync.annotationTypes[newAnno.annotation_type]
                }
                exact_sync.saveAnnotation(newAnno)
            }

            for (let unique_identifier of new Set(resultDict.included)) {

                var annotation = exact_sync.getAnnotation(unique_identifier);
                var newType = event.userData.getCurrentAnnotationType();

                if (newType !== undefined) {

                    if (annotation.annotation_type.id !== newType.id) {
                        // check if annotation type can be converted and save
                        if (tool.checkIfAnnotationTypeChangeIsValid(annotation.annotation_type.vector_type,
                            newType.vector_type)) {
                            annotation.annotation_type = newType;
                            tool.updateAnnotationType(annotation.unique_identifier, newType, false);

                            annotation.vector = event.userData.getAnnotationVector(annotation.unique_identifier);
                            exact_sync.saveAnnotation(annotation)
                        }
                    }
                }
            }
        }, this)
    }

    onImageViewChanged(event) {
        super.onImageViewChanged(event);

        this.tool.updateStrokeWidth(null);
    }

    handleKeyUp(event) {
        if (["textarea", "text", "number"].includes(event.target.type))
            return;

        switch (event.keyCode) {

            case 8: //'DEL'
                this.deleteAnnotation();
                break;
            case 88: //'X'
                this.deleteAnnotation();
                break;
            case 120: //'X'
                this.deleteAnnotation();
                break;

            case 13: //'enter'
                this.finishAnnotation();
                break;
            case 27: // Escape
                this.cancelEditAnnotation();
                break;
            case 46: //'DEL'
                this.deleteAnnotation();
                break;

            case 49: //1
            case 97: //1
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(1);
                }
                break;
            case 50: //2
            case 98: //2
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(2);
                }
                break;
            case 51: //3
            case 99: //3
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(3);
                }
                break;
            case 52: //4
            case 100: //4
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(4);
                }
                break;
            case 53: //5
            case 101: //5
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(5);
                }
                break;
            case 54: //6
            case 102: //6
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(6);
                }
                break;
            case 55: //7
            case 103: //7
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(7);
                }
                break;
            case 56: //8
            case 104: //8
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(8);
                }
                break;
            case 57: //9
            case 105: //9
                if (!event.shiftKey) {
                    this.changeAnnotationTypeByKey(9);
                }
                break;

            case 66: //b
                break;
            case 67: //c
                this.viewer.selectionInstance.toggleState();
                break;
            case 82: //r
                this.tool.resetSelection();
                break;
            case 86: //'v'
                this.finishAnnotation();
                break;
            case 89: // 'y'
                this.uiShowAnnotationsToggle();
                break;
        }
    }

    initToolEventHandler(viewer) {

        viewer.addHandler('sync_drawAnnotations', function (event) {
            event.userData.tool.drawExistingAnnotations(event.annotations, event.userData.drawAnnotations);
        }, this);
    }

    initUiEvents(annotation_types) {


        $(document).keyup(this.handleKeyUp.bind(this));
        $('select#annotation_type_id').change(this.changeAnnotationTypeByComboxbox.bind(this));

        // tool events
        $('#StrokeWidthSlider').on("input", this.updateStrokeWidth.bind(this));

        for (let annotation_type of Object.values(annotation_types)) {

            $('#DrawCheckBox_' + annotation_type.id).change(this.uiLocalAnnotationVisibilityChanged.bind(this));
            $('#annotation_type_id_button_' + annotation_type.id).click(this.uiAnnotationTypeChanged.bind(this));

            let key_number = $('#annotation_type_' + annotation_type.id).data('annotation_type_key');
            this.annotationTypeKeyToIdLookUp[key_number] = annotation_type.id;
        }

        let element = new OpenSeadragon.Button({
            tooltip: 'Draw annotations (y)',
            name: "DrawAnnotations",
            srcRest: this.viewer.prefixUrl + `eye_fill.svg`,
            srcGroup: this.viewer.prefixUrl + `eye_fill.svg`,
            srcHover: this.viewer.prefixUrl + `eye_slash.svg`,
            srcDown: this.viewer.prefixUrl + `eye_slash.svg`,
            onClick: this.uiShowAnnotationsToggle.bind(this),
        });
        this.viewer.buttons.buttons.push(element);
        this.viewer.buttons.element.appendChild(element.element);


        // Register Annotation Buttons
        this.annotationButtons = [
            new OpenSeadragon.Button({
                tooltip: 'Save (v)',
                name: "save_button",
                srcRest: this.viewer.prefixUrl + `hdd.svg`,
                srcGroup: this.viewer.prefixUrl + `hdd.svg`,
                srcHover: this.viewer.prefixUrl + `hdd.svg`,
                srcDown: this.viewer.prefixUrl + `hdd.svg`,
                onClick: this.finishAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Reset (ESC)',
                name: "reset_button",
                srcRest: this.viewer.prefixUrl + `arrow_counterclockwise.svg`,
                srcGroup: this.viewer.prefixUrl + `arrow_counterclockwise.svg`,
                srcHover: this.viewer.prefixUrl + `arrow_counterclockwise.svg`,
                srcDown: this.viewer.prefixUrl + `arrow_counterclockwise.svg`,
                onClick: this.cancelEditAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Verify',
                name: "verify_annotation_button",
                srcRest: this.viewer.prefixUrl + `check.svg`,
                srcGroup: this.viewer.prefixUrl + `check.svg`,
                srcHover: this.viewer.prefixUrl + `check.svg`,
                srcDown: this.viewer.prefixUrl + `check.svg`,
                onClick: this.verifyAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Delete (DEL, x)',
                name: "delete_annotation_button",
                srcRest: this.viewer.prefixUrl + `trash.svg`,
                srcGroup: this.viewer.prefixUrl + `trash.svg`,
                srcHover: this.viewer.prefixUrl + `trash.svg`,
                srcDown: this.viewer.prefixUrl + `trash.svg`,
                onClick: this.deleteAnnotation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Substract the slected objects area from all other objects ',
                name: "NOT",
                srcRest: this.viewer.prefixUrl + `subtract.svg`,
                srcGroup: this.viewer.prefixUrl + `subtract.svg`,
                srcHover: this.viewer.prefixUrl + `subtract.svg`,
                srcDown: this.viewer.prefixUrl + `subtract.svg`,
                onClick: this.tool.clickPolyOperation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Merge all polygon objects from the same class touching the selected object',
                name: "UNION",
                srcRest: this.viewer.prefixUrl + `union.svg`,
                srcGroup: this.viewer.prefixUrl + `union.svg`,
                srcHover: this.viewer.prefixUrl + `union.svg`,
                srcDown: this.viewer.prefixUrl + `union.svg`,
                onClick: this.tool.clickPolyOperation.bind(this),
            }),
            new OpenSeadragon.Button({
                tooltip: 'Changes the class of all included objects to selected class if possible',
                name: "HARMONIZE",
                srcRest: this.viewer.prefixUrl + `basket.svg`,
                srcGroup: this.viewer.prefixUrl + `basket.svg`,
                srcHover: this.viewer.prefixUrl + `basket.svg`,
                srcDown: this.viewer.prefixUrl + `basket.svg`,
                onClick: this.tool.clickPolyOperation.bind(this),
            })
        ]


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
        if (this.annotationsToggle === true) {
            this.annotationsToggle = false;
        } else {
            this.annotationsToggle = true;
        }
        this.annotationVisibility(this.annotationsToggle);
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

        this.changeAnnotationTypeVisibility(annotation_type_id, event.currentTarget.checked);
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
                this.tool.removeAnnotation(uuid);
                this.exact_sync.deleteAnnotation(uuid);
            } else { // just cancel editing
                this.tool.resetSelection()
            }
        } else {
            // Todo: Handle annoation editing buttons like save, valid etc.
        }
    }

    annotationVisibility(drawAnnotations = true) {

        for (const annotation_type_id in this.annotationTypes) {
            this.tool.updateVisbility(annotation_type_id, drawAnnotations);
        }
    }

    changeAnnotationTypeVisibility(annotation_type_id, visibility) {
        this.tool.updateVisbility(annotation_type_id, visibility);
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
            this.exact_sync.saveAnnotation(annotation)
            this.tool.resetSelection();
        }
    }

    deleteAnnotation(annotation) {
        // if annotation is undefined use current selected one
        if (typeof annotation === "undefined" ||
            annotation.hasOwnProperty('originalEvent')) {
            annotation = this.getCurrentSelectedAnnotation();
        }

        if (typeof annotation !== "undefined") {
            this.tool.removeAnnotation(annotation.unique_identifier);
            this.exact_sync.deleteAnnotation(annotation.unique_identifier);
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
                    annotation.annotation_type.vector_type, newType.vector_type)) {

                    annotation.annotation_type = newType;
                    this.tool.updateAnnotationType(annotation.unique_identifier, newType);
                    this.exact_sync.saveAnnotation(annotation);

                    this.setCurrentAnnotationType(newType);
                } else {
                    $("#annotation_type_id").notify("Conversion to this type is not allowed.",
                        { position: "right", className: "error" });
                }
            }
        } else {
            let annotation_type = this.annotationTypes[new_annoation_type_id];
            this.setCurrentAnnotationType(annotation_type);
        }
    }

    updateStrokeWidth(value) {

        if (value.hasOwnProperty('originalEvent')) {
            value = value.valueAsNumber
        }

        this.tool.updateStrokeWidth(value);
    }

    destroy() {

        // unregister UI events
        $(document).off("keyup");
        $('select#annotation_type_id').off("change");
        $('#StrokeWidthSlider').off("input");
        for (let annotation_type of Object.values(this.annotationTypes)) {

            $('#DrawCheckBox_' + annotation_type.id).off("change");
            $('#annotation_type_id_button_' + annotation_type.id).off("click");
        }

        super.destroy();

        this.tool.clear();
        this.teamTool.destroy();
        this.searchTool.destroy();
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
            return item.vector.frame === frame_id && item.deleted === false
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

        $(document).keyup(this.handleKeyUp.bind(this));

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

        $(document).keyup(this.handleKeyUp.bind(this));
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
