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
                if (($('#processing-'+job.plugin).attr("style").length==0) && (job.processing_complete==100))
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
                $('#alpha-plugin-' + job.plugin).attr('data-plugin_resultentries',JSON.stringify(entries))
                $('#vis-plugin-' + job.plugin).attr('data-plugin_id',job.plugin)
                var sliderValue;
                if ($('#alpha-plugin-'+ job.plugin).length>0)
                {
                 sliderValue = $('#alpha-plugin-'+ job.plugin)[0].value;
                }
                else
                {
                 sliderValue = 50;
                }
                let txt = '';
                var threshold_fields = []
                for (let resultentry of job.result.entries)
                {
                    txt += '<table><tr><th colspan=2>'+resultentry.name
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
                    if (resultentry.annotation_results.length>0)
                    {
                        txt += '</th></tr><tr><td>'
                        var currentthreshold
                        if ($('#resultentry-threshold-'+resultentry.id).length>0)
                        {
                            currentthreshold = $('#resultentry-threshold-'+resultentry.id)[0].value;
                        }
                        else
                        {
                         currentthreshold = resultentry.default_threshold;
                        }
                        txt += ' Threshold: <input size=3 id="resultentry-threshold-'+resultentry.id+'" type=text data-plugin_id='+job.plugin+' data-pluginresultentry_id='+resultentry.id+' value=' + currentthreshold+'>';
                        threshold_fields.push(resultentry.id)
                    }
                    txt += '</tr></table><br/>';
                }
                
                if ($('#collapsePlugin-' + job.plugin)[0].ariaLabel != job.result.entries.length)
                {
                    // only refresh if change needed. We store the length in the aria Label for this.
                    $('#collapsePlugin-' + job.plugin).html(txt)
                    $('#collapsePlugin-' + job.plugin)[0].ariaLabel=job.result.entries.length
                }
                for (let rentry of threshold_fields)
                {
                    $('#resultentry-threshold-' + rentry).change(this.changePluginResThreshold.bind(this)); 
                    var event = new Event('change');
                    $('#resultentry-threshold-' + rentry)[0].dispatchEvent(event);
                }
                $('#alpha-plugin-' + job.plugin).change(this.togglePluginResultAlpha.bind(this)); 
                $('#alpha-plugin-' + job.plugin).on('input', this.togglePluginResultAlpha.bind(this)); 

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

    changePluginResThreshold(event)
    {
        let pluginresultentry_id = parseInt(event.target.dataset.pluginresultentry_id);
        let plugin_id = parseInt(event.target.dataset.plugin_id);
        let value = parseFloat(event.currentTarget.value);
        this.viewer.raiseEvent('processing_adjustThreshold', { "Plugin": plugin_id, "ResultEntry": pluginresultentry_id, "Value": value });


    }

    togglePluginResultAlpha(event) {

        let plugin_id = parseInt(event.target.dataset.plugin_id);
        let pluginresult_entries = event.target.dataset.plugin_resultentries.replace(',]', ']')
        pluginresult_entries = JSON.parse(pluginresult_entries);
        let value = parseInt(event.currentTarget.value);

        this.viewer.raiseEvent('processing_changePluginResultAlpha', { "Plugin": plugin_id, "ResultEntries": pluginresult_entries, "Value": value });
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
                $('#alpha-plugin-' + job.plugin).off("change");
                $('#alpha-plugin-' + job.plugin).off("input");
                $('#vis-plugin-' + job.plugin).off("change");

                $('#compl-'+job.plugin).attr("style","display:none");
                $('#processing-'+job.plugin).attr("style","display:none");
                $('#process-'+job.plugin).attr("style","");
            }
    }
}