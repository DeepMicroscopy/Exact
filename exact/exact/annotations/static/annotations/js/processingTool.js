class ProcessingTool {
    constructor (viewer, image_id) {

        this.viewer = viewer;
        this.image_id = image_id
        this.processing_sync = new EXACTProcessingSync(viewer, image_id);
        

        viewer.addHandler("sync_ProcessingPluginJobsLoaded", function (event) {

            event.userData.initUiEvents();
        }, this);

        viewer.addHandler("sync_ProcessingPluginsLoaded", function (event) {
            event.userData.initPluginrelatedUI();
        }, this);
    }

    initPluginrelatedUI()
        {
            for (let plugin of Object.values(this.processing_sync.plugins))
            {
                let SUBMIT_URL = include_server_subdir(`/processing/submit/`);
                $('#run_processing_' + plugin.id).attr('href', SUBMIT_URL + plugin.id + '/' + this.image_id); 
            }
        }
    
    initUiEvents () {

        for (let job of Object.values(this.processing_sync.results)) {
            $('#vis-plugin-' + job.plugin).change(this.togglePluginResultVisibility.bind(this)); 
            if (job.result) // processing is complete
            {
                $('#compl-'+job.plugin).attr("style","");
                if ($('#processing-'+job.plugin).attr("style").length==0)
                {
                    // if the processing is shown at the moment but the job has finished, reload to get all the annotations
                    location.reload(); 
                }
                let entries = []
                for (const entry of job.result.entries)
                {
                    entries.push(entry.id)
                }
                $('#vis-plugin-' + job.plugin).attr('data-plugin_resultentries',JSON.stringify(entries))
                $('#vis-plugin-' + job.plugin).attr('data-plugin_id',job.plugin)
                let txt = '';
                for (let resultentry of job.result.entries)
                {
                    txt += resultentry.name;
                    if ((resultentry.annotation_results.length>0) && (resultentry.bitmap_results.length>0))
                    {
                        txt += ' ('+resultentry.annotation_results.length+' annotations, ';
                        txt += resultentry.bitmap_results.length+' bitmaps)';
                    }
                    else if (resultentry.annotation_results.length>0)
                    {
                        txt += ' ('+resultentry.annotation_results.length+' annotations)';
                    }
                    else if (resultentry.bitmap_results.length>0)
                    {
                        txt += ' ('+resultentry.bitmap_results.length+' bitmaps)';
                    }
                    txt += '<br/>';
                }
                $('#collapsePlugin-' + job.plugin).html(txt)
            }
            else
            {
                $('#processing-'+job.plugin).attr("style","");
                $('#completed-'+job.plugin).text(job.processing_complete.toFixed(2) + ' %')
                $('#completed-'+job.plugin).attr("aria-valuenow",job.processing_complete)
                $('#completed-'+job.plugin).attr("style",'width:' + Math.round(job.processing_complete) + '%')
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