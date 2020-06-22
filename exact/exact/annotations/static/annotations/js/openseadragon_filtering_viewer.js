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

        if ($("#CLAHESlider-enabled").prop("checked"))
            processors.push(OpenSeadragon.Filters.CLAHE(parseInt($("#CLAHESlider").val())))

        this.viewer.setFilterOptions({ filters: { processors: processors } });
    }
} 