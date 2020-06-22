// 

class OpenseadragonFilteringViewer {

    constructor(viewer) {

        this.viewer = viewer;

        this.initUiEvents();
    }

    initUiEvents() {


        $("#Invert-enabled").click(updateFiltersOnImage);
        $("#GREYSCALE-enabled").click(updateFiltersOnImage);
        $("#Red-enabled").click(updateFiltersOnImage);
        $("#Green-enabled").click(updateFiltersOnImage);
        $("#Blue-enabled").click(updateFiltersOnImage);
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