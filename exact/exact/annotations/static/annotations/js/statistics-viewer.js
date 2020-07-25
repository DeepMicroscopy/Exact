

class StatisticsViewer{
    constructor(viewer, exact_sync) {

        this.viewer = viewer;
        this.exact_sync = exact_sync;

        this.initViewerEventHandler(viewer);
    }

    initViewerEventHandler(viewer) {

        viewer.addHandler('sync_UpdateStatistics', function (event) {
            this.userData.updateStatistics();
        }, this);
    }

    updateStatistics() {
        
        let total_loaded = 0;
        let total = 0;
        let loading = false; 

        for (let type_statistics of Object.values(this.exact_sync.statistics)) {
            total += type_statistics.total;

            let anno_type = type_statistics.annotation_type;

            let elements = Object.values(this.exact_sync.annotations).filter(function(annotation) {
                return annotation.deleted === false && annotation.annotation_type.id === this.id;
            }, anno_type).length;

            total_loaded += elements;
            let annotype_element = document.getElementById(anno_type.name + '_' + anno_type.id);
            if (annotype_element !== null) {
                if (type_statistics.finished) {
                    annotype_element.innerHTML = elements;
                } else {
                    loading = true;
                    annotype_element.innerHTML = `${elements} / ${type_statistics.total}`;
                }
            }
        }

        var total_elem = document.getElementById('statistics_total_annotations');
        if (total_elem !== null) {
            if (loading) {
                total_elem.innerHTML =  `${total_loaded} / ${total}`;
            } else {
                total_elem.innerHTML = total_loaded;
            }            
        }
    }
}