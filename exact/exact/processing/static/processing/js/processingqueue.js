function include_server_subdir(url) {
    sub_dir =  window.location.pathname.split("/processing/")[0]
    if (sub_dir === "") { return url } else { return sub_dir + url }
}

var gCsrfToken;
var gHeaders;

function refreshJobList (event) {

    for (let job of Object.values(event.results)) {
        $('#completed-'+job.id).text(job.processing_complete.toFixed(2) + ' %')
        $('#completed-'+job.id).attr("aria-valuenow",job.processing_complete)
        $('#completed-'+job.id).attr("style",'width:' + Math.round(job.processing_complete) + '%')

        if (job.processing_complete==100)
        { 
                $('#firstcolumn-'+job.id).html('<img src="'+include_server_subdir('/static/images/check.svg')+'">');
        }
        if (job.attached_worker) 
        {
            $('#firstcolumn-'+job.id).html('<div class="spinner-border spinner-border-sm" role="status"></div>');
        }
       if (((job.error_message) && job.error_message.length>0))
        {
            // set exclamation mark
            $('#firstcolumn-'+job.id).html('<img src="'+include_server_subdir('/static/images/exclamation-octagon.svg')+'">');

            $('#completed-'+job.id).removeClass('bg-danger').addClass('bg-danger'); // make progress bar red
        }
    }
}

class EXACTProcessingListSync {

    constructor() {
        let url_parameters = decodeURIComponent(window.location.search.substring(1)).split('&');
        // get current environment
        gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();

        gHeaders = {
            "Content-Type": 'application/json',
            "X-CSRFTOKEN": gCsrfToken
        };

        window.addEventListener("sync_ProcessingJobListLoaded", function (event) {
            refreshJobList(event.detail);
        }, this);

        let user_id = parseInt($('#user_id').html());
        let icb = $('#incomplete_jobs').first().text();
        
        this.results = {};
        this.API_1_PROCESSING__BASE_URL = include_server_subdir(`/api/v1/processing/pluginjobs/?filter_ids=${icb}`);
        this.loadPluginJobList(this.API_1_PROCESSING__BASE_URL, this);

        setInterval(function(my){
            my.loadPluginJobList(my.API_1_PROCESSING__BASE_URL, my); // refresh every 2 seconds
        }, 2000, this);
    }


    loadPluginJobList(url, context) {
        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data) {


                for (let result of data.results) {

                    context.results[result.id] = result;
                }

                window.dispatchEvent(new CustomEvent("sync_ProcessingJobListLoaded", {"detail": context}));
            },
            error: function (request, status, error) {
                if (request.responseText !== undefined) {
                    $.notify(request.responseText, { position: "bottom center", className: "error" });
                } else {
                    $.notify(`Server ERR_CONNECTION_TIMED_OUT`, { position: "bottom center", className: "error" });
                }
            }
        });
    
    }
}

(function () {

    var processing_sync;
    
    $(function () {
        processing_sync = new EXACTProcessingListSync();

    });
})();
