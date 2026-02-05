function include_server_subdir(url) {
    sub_dir =  window.location.pathname.split("/annotations/")[0]
    if (sub_dir === "") { return url } else { return sub_dir + url }
}



class ShowImageProperties{
    constructor(viewer, imageId) {
        
        this.viewer = viewer;
        this.imageId = imageId;

        this.updateImageInfo(viewer, imageId);
    }

    updateImageInfo(viewer, imageId) {
        // get current environment
        let gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();

        let gHeaders = {
            "Content-Type": 'application/json',
            "X-CSRFTOKEN": gCsrfToken
        };

        let url = include_server_subdir('/images/api/image/metadata/'+imageId+'/');
        $.ajax(url, {
            type: 'GET', headers: gHeaders, dataType: 'json',
            success: function (data) {

                let table = ""
                for (let [key,value] of Object.entries(data.meta_data)) {
                    table += "<tr><td>"+data.meta_data_dict[key]+"</td><td>"+value+'</td></tr>'
                }
                $("#image_info_table").html(table)
//                window.dispatchEvent(new CustomEvent("sync_ProcessingJobListLoaded", {"detail": context}));
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