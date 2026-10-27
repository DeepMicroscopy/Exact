// 

class OpenseadragonFilteringViewer {

    constructor(viewer) {

        this.viewer = viewer;
        this.sliderNames = ['#ContrastSlider', '#CLAHESlider', 
            '#BRIGHTNESSSlider', '#THRESHOLDINGSlider']

        this.initUiEvents();
    }

    initUiEvents() {

        for (const sliderName of this.sliderNames) {

            $(sliderName).slider();
            $(sliderName).on("change", this.updateFiltersOnImage.bind(this));
            $(sliderName + "-enabled").click(this.sliderActiveToogle.bind(this));            
        }

        $("#Invert-enabled").click(this.updateFiltersOnImage.bind(this));
        $("#GREYSCALE-enabled").click(this.updateFiltersOnImage.bind(this));
        $("#Red-enabled").click(this.updateFiltersOnImage.bind(this));
        $("#Green-enabled").click(this.updateFiltersOnImage.bind(this));
        $("#Blue-enabled").click(this.updateFiltersOnImage.bind(this));
    }

    sliderActiveToogle(event) {

        for (const sliderName of this.sliderNames) {
            if ($(sliderName + "-enabled").prop("checked")) {
                $(sliderName).slider("enable");
            } else {
                $(sliderName).slider("disable");
            }
        }

        this.updateFiltersOnImage(null);
    }

    updateFiltersOnImage(event) {

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

        if ($("#CLAHESlider-enabled").prop("checked")) {
            if (EXACTOpenCV.isReady()) {
                processors.push(OpenSeadragon.Filters.CLAHE(parseInt($("#CLAHESlider").val())))
            } else {
                // CLAHE needs OpenCv js, which is loaded the first time it is used
                if ($.notify) {
                    $.notify("Loading the image processing library...", { position: "top center", className: "info" });
                }
                EXACTOpenCV.load().then(() => this.updateFiltersOnImage(null));
            }
        }

        this.applyProcessors(processors);
    }

    /**
     * The filters work on the 2D canvas of the tiles ('tile-drawing' event). The WebGL drawer, which is the default
     * since OpenSeadragon 5, does not raise this event, so the filters had no effect any more. The (slower) canvas
     * drawer is therefore only used while a filter is active.
     */
    applyProcessors(processors) {

        const filtersActive = processors.length > 0;

        if (this.defaultDrawerType === undefined) {
            this.defaultDrawerType = this.viewer.drawer.getType();
        }

        if (filtersActive) {
            // has to be done before the filter plugin is created: it registers its handler for the drawer in use
            this.requestDrawer('canvas');
        } else if (!this.viewer.filterPluginInstance) {
            return;  // nothing was filtered so far
        }

        this.viewer.setFilterOptions({ filters: { processors: processors } });

        if (!filtersActive) {
            this.requestDrawer(this.defaultDrawerType);
        }
    }

    requestDrawer(type) {
        if (this.viewer.drawer.getType() !== type) {
            this.viewer.requestDrawer(type, { mainDrawer: true });
        }
    }
} 