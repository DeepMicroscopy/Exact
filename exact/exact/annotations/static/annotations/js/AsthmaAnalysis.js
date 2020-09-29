
class AsthmaAnalysis {

    constructor(image_id, viewer, exact_sync) {
        this.image_id = image_id;
        this.viewer = viewer;
        this.exact_sync = exact_sync;


        this.initUiEvents();
    }

    initUiEvents() {

        $('#asthma_neutrophils').html('/');
        $('#asthma_macrophages').html('/');
        $('#asthma_eosinophils').html('/');
        $('#asthma_mast_cell').html('/'); 
        $('#asthma_total').html('/');

        $('#asthma_update_btn').click(this.updateAsthmaScore.bind(this))
    }

    updateAsthmaScore() {

        let all_annotations = Object.values(this.exact_sync.annotations).filter(function (item) {
            return ["neutrophile", "makrophagen", "eosinophile", "mastzellen"].includes(item.annotation_type.name.toLowerCase()) & item.deleted == false;
        });

        if (all_annotations.length > 0) {

            let neutrophils = all_annotations.filter(function (item) {
                return item.annotation_type.name.toLowerCase() === "Neutrophile".toLowerCase();
            });

            $('#asthma_neutrophils').html((neutrophils.length / all_annotations.length * 100).toFixed(2)  + "%");
    
            let macrophages = all_annotations.filter(function (item) {
                return item.annotation_type.name.toLowerCase() === "Makrophagen".toLowerCase();
            });

            $('#asthma_macrophages').html((macrophages.length / all_annotations.length * 100).toFixed(2)  + "%");
    
            let eosinophils = all_annotations.filter(function (item) {
                return item.annotation_type.name.toLowerCase() === "Eosinophile".toLowerCase();
            });

            $('#asthma_eosinophils').html((eosinophils.length / all_annotations.length * 100).toFixed(2)  + "%");
    
            let mast_cells = all_annotations.filter(function (item) {
                return item.annotation_type.name.toLowerCase() === "Mastzellen".toLowerCase();
            });

            $('#asthma_mast_cell').html((mast_cells.length / all_annotations.length * 100).toFixed(2) + "%");
    
            $('#asthma_total').html(all_annotations.length );
        }
    }

    destroy() {
        $('#asthma_update_btn').off("click");
    }
}