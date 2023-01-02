class ProcessingTool {
    constructor (viewer, image_id) {

        this.viewer = viewer;
        this.processing_sync = new EXACTProcessingSync(viewer, image_id);

        viewer.addHandler("sync_ProcessingLoaded", function (event) {

            event.userData.initUiEvents();
        }, this);
    }

    initUiEvents () {

        for (let job of Object.values(this.processing_sync.results)) {
            $('#vis-plugin-' + job.plugin).change(this.togglePluginResultVisibility.bind(this)); 
            if (job.result) // processing is complete
            {
                $('#compl-'+job.plugin).attr("style","");
            }
            else
            {
                $('#processing-'+job.plugin).attr("style","");
                $('#completed-'+job.plugin).text(job.processing_complete + ' %')
                $('#completed-'+job.plugin).attr("aria-valuenow",job.processing_complete)
                $('#completed-'+job.plugin).attr("style",' style="width: {{' + Math.round(job.processing_complete) + '%"')
            }
            $('#process-'+job.plugin).attr("style","display:none");
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

        for (let job of Object.values(this.processing_sync.results)) {
                $('#vis-plugin-' + job.plugin).off("change");
                $('#compl-'+job.plugin).attr("style","display:none");
                $('#processing-'+job.plugin).attr("style","display:none");
                $('#process-'+job.plugin).attr("style","");
            }
    }
}