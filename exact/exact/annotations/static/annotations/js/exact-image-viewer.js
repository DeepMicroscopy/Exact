// JS file for handling the openseadragon viewer

class EXACTViewer {
    constructor(options, imageInformation) {

        this.imageId = imageInformation['id']
        this.imageInformation = imageInformation;

        this.viewer = this.createViewer(options);
        this.initViewerEventHandler(this.viewer, imageInformation)

        console.log(`${this.constructor.name} loaded for id ${this.imageId}`)
    }

    static factoryCreateViewer(image_url, imageId, options, imageInformation, annotationTypes = undefined,
        headers = undefined, username = undefined, drawAnnotations = true, strokeWidth = 5) {

        if (imageInformation['depth'] == 1 && imageInformation['frames'] == 1) {
            options.tileSources = [image_url + `/images/image/${imageId}/1/1/tile/`]
        }
        if (imageInformation['depth'] > 1 || imageInformation['frames'] > 1) {
            let tileSources = []
            // first iterrate time points
            for (const frame of Array(imageInformation['frames']).keys()) {
                // for each frame iterrate z dimension
                for (const z of Array(imageInformation['depth']).keys()) {
                    // image_id/z/frame/
                    let path = image_url + `/images/image/${imageId}/${z+1}/${frame+1}/tile/`
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

            // crate viewer with global and local support
            if (Object.keys(global_annotation_types).length > 0
                && Object.keys(local_annotation_types).length > 0) {
                return new EXACTViewerGlobalLocalAnnotations(options, imageInformation, local_annotation_types, global_annotation_types,
                    headers, username, drawAnnotations, strokeWidth)
            } else if (Object.keys(global_annotation_types).length > 0) {
                return new EXACTViewerGlobalAnnotations(options, imageInformation, annotationTypes,
                    headers, username)
            } else {
                return new EXACTViewerLocalAnnotations(options, imageInformation, annotationTypes,
                    headers, username, drawAnnotations, strokeWidth)
            }
        } else {
            // create viewer without the option to handle annotations
            return new EXACTViewer(options, imageInformation)
        }
    }

    createViewer(options) {

        const default_options = {
            id: "openseadragon1",
            prefixUrl: '../../static/images/',
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
        };

        const viewer_options = Object.assign(default_options, options);

        return OpenSeadragon(viewer_options);
    }

    initViewerEventHandler(viewer, imageInformation) {

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
            prefixUrl: '../../static/images/',
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

        viewer.activateImagingHelper({ onImageViewChanged: this.onImageViewChanged });

        // add zoome slider if objective power is greater than 1
        var objectivePower = imageInformation['objectivePower'];
        if (objectivePower > 1) {

            const default_ticks = [0, 1, 2, 5, 10, 20, 40, 80, 160];
            const default_names = ["0x", "1x", "2x", "5x", "10x", "20x", "40x", "80x", "160x"];

            var ticks_to_use = [];
            var labels_to_use = [];

            for (i = 0; i < default_ticks.length; i++) {
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
                ticks_snap_bounds: 1
            });
            this.gZoomSlider.on('change', this.onSliderChanged);
        }
    }

    initToolEventHandler(viewer) {
        return;
    }

    createDrawingModule(viewer, imageId, imageInformation) {
        return;
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, username) {
        return;
    }

    destroy() {
        this.viewer.destroy();
        this.tool.clear();
        this.exact_sync.destroy();
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

            this.tool.updateStrokeWidth(null);
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

    constructor(options, imageInformation, annotationTypes,
        headers, username, drawAnnotations = true, strokeWidth = 5) {

        super(options, imageInformation)

        this.tool = this.createDrawingModule(this.viewer, this.imageId, this.imageInformation);
        this.initToolEventHandler(this.viewer);

        this.exact_sync = this.createSyncModules(annotationTypes, this.imageId, headers, this.viewer, username);
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation)

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
    }


    initToolEventHandler(viewer) {

        viewer.addHandler('sync_drawAnnotations', function (event) {
            event.userData.tool.drawExistingAnnotations(event.annotations, event.userData.drawAnnotations);
        }, this);
    }

    createDrawingModule(viewer, imageId, imageInformation) {
        return new BoundingBoxes(viewer, imageId, imageInformation);
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, username) {
        return new EXACTAnnotationSync(annotationTypes, imageId, headers, viewer, username)
    }

    destroy() {
        super.destroy();

        this.tool.clear();
        this.exact_sync.destroy();
    }
}


class EXACTViewerGlobalAnnotations extends EXACTViewer {

    constructor(options, imageInformation, annotationTypes,
        headers, username) {

        super(options, imageInformation);
        this.exact_sync = this.createSyncModules(annotationTypes, this.imageId, headers, this.viewer, username);
    }

    initViewerEventHandler(viewer, imageInformation) {

        super.initViewerEventHandler(viewer, imageInformation)

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
    }

    createSyncModules(annotationTypes, imageId, headers, viewer, username) {
        return new EXACTGloabalAnnotationSync(annotationTypes, imageId, headers, viewer, username)
    }

    destroy() {
        super.destroy();
        this.exact_sync.destroy();
    }
}

class EXACTViewerGlobalLocalAnnotations extends EXACTViewerLocalAnnotations {

    constructor(options, imageInformation, annotationTypesLocal, annotationTypesGlobal,
        headers, username, drawAnnotations = true, strokeWidth = 5) {

        super(options, imageInformation, annotationTypesLocal, headers,
            username, drawAnnotations, strokeWidth);

        this.exact_sync_global = new EXACTGloabalAnnotationSync(annotationTypesGlobal,
            this.imageId, headers, this.viewer, username)
    }


    destroy() {
        super.destroy();

        this.exact_sync_global.destroy();
    }
}