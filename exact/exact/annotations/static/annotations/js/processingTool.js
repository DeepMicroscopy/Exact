class ProcessingTool {
    constructor (viewer, image_id) {

        this.viewer = viewer;
        this.processing_sync = new EXACTProcessingSync(viewer, image_id);

        viewer.addHandler("sync_ProcessingLoaded", function (event) {

            event.userData.initUiEvents();
        }, this);
    }

    initUiEvents () {


        for (let result of Object.values(this.processing_sync.results)) {
            $('#vis-plugin-' + result.plugin).change(this.togglePluginResultVisibility.bind(this)); 
        }

    }



    togglePluginResultVisibility(event) {

        let plugin_id = parseInt(event.target.dataset.plugin_id);
        let pluginresult_entries = event.target.dataset.plugin_resultentries.replace(',]', ']')
        pluginresult_entries = JSON.parse(pluginresult_entries);
        let checked = event.currentTarget.checked;

        this.viewer.raiseEvent('processing_togglePluginResultVisibility', { "Plugin": plugin_id, "ResultEntries": pluginresult_entries, "Checked": checked });
    }


    destroy() { 

        for (let result of Object.values(this.processing_sync.results)) {
                $('#vis-plugin-' + member.id).off("change");
        }
    }
}