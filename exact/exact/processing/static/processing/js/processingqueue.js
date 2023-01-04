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

        let server_url = window.location.origin + window.location.pathname.split("/processing")[0];
        let user_id = parseInt($('#user_id').html());

        let API_BASE_URL = include_server_subdir('/api/v1/annotations/') 
        
        this.results = {};
        this.API_1_PROCESSING__BASE_URL = include_server_subdir(`/api/v1/processing/pluginjobs/?limit=50`);
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
